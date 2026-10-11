import {Suspense, useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {
  Await,
  Form,
  Link,
  NavLink,
  useAsyncValue,
  useFetcher,
  useLocation,
} from 'react-router';
import {BsBasket3} from 'react-icons/bs';
import {
  CartForm,
  Image,
  Money,
  type CartViewPayload,
  type I18nBase,
  type OptimisticCart,
  useAnalytics,
  useOptimisticCart,
} from '@shopify/hydrogen';
import type {HeaderQuery, CartApiQueryFragment} from 'storefrontapi.generated';
import type {PredictiveSearchReturn} from '~/lib/search';
import {useAside} from '~/components/Aside';
import {
  LocaleMenu,
} from '~/components/CountrySelector';
import {useTranslate} from '~/lib/useTranslate';
import {
  PROMO,
  formatPromoTime,
  usePromoCountdown,
  SECOND_PAIR,
} from '~/lib/promo';
import {displayOptionName} from '~/components/QuickAdd';
import {useLocalePrefix, useLocalizedHref} from '~/lib/localizedLink';
import {useWishlist} from '~/lib/wishlist';
import {splitBrandTitle} from '~/lib/brand';
import {BRAND_LOCKUP, SHOP} from '~/data/shop';
import {brandLogoFor, menuImageFor} from '~/data/menuImages';

/**
 * Trailing mark on a menu tile: the brand's wordmark where we have one, a
 * product cutout otherwise, or the "%" glyph for Sale (matching the
 * homepage card). Bestsellers gets none — the dark tile and gold label
 * already set it apart.
 */
/**
 * The "%" that stands in for a photo on Sale tiles. Typography, not a
 * product shot — so it survives on the department panel, where the photos
 * don't.
 */
function SaleMark({path}: {path?: string | null}) {
  if (!path || !/\/collections\/sale(\b|$|\?)/.test(path)) return null;
  return (
    <span className="mobile-menu-tile-mark" aria-hidden="true">
      %
    </span>
  );
}

function TileThumb({path}: {path?: string | null}) {
  const mark = SaleMark({path});
  if (mark) return mark;
  const src = menuImageFor(path);
  if (!src) return null;
  return (
    <img className="mobile-menu-tile-img" src={src} alt="" loading="lazy" />
  );
}

/**
 * The face of a menu tile. A brand we hold a wordmark for shows the logo
 * alone — the mark *is* the name, so printing both says it twice. The
 * label stays in the DOM for screen readers and for search.
 *
 * Brands without a mark keep their name as the wordmark: an empty tile
 * would be unusable, so the text is the fallback rather than a blank.
 */
function TileFace({title, path}: {title: string; path?: string | null}) {
  const logo = brandLogoFor(path);
  if (logo) {
    return (
      <>
        <span className="sr-only">{title}</span>
        <img
          className="mobile-menu-tile-img is-logo"
          src={logo}
          alt={title}
          loading="lazy"
        />
      </>
    );
  }
  // A brand with no logo file on hand is set as a typographic wordmark, so a
  // panel of brands reads as one wall of marks. No product photo: a picture
  // of one hoodie says less about the label than its name does.
  if (isBrandPath(path)) {
    return <span className="mobile-menu-tile-wordmark">{title}</span>;
  }
  return (
    <>
      <span>{title}</span>
      <TileThumb path={path} />
    </>
  );
}

/**
 * Collection handles that stand for a brand rather than a category.
 * Built on first use, not at module scope: BRAND_COLLECTIONS is declared
 * further down this file, so reading it during module evaluation would hit
 * the temporal dead zone.
 */
let brandHandles: Set<string> | null = null;

function isBrandPath(path?: string | null): boolean {
  const match = path ? /\/collections\/([a-z0-9-]+)/i.exec(path) : null;
  if (!match) return false;
  brandHandles ??= new Set(Object.values(BRAND_COLLECTIONS));
  return brandHandles.has(match[1].toLowerCase());
}

/**
 * A panel that is (nearly) all brands — Sneakers, Clothing — is laid out as a
 * wall of small square logo tiles, four across. Women, Kids and Accessories
 * are categories with a stray brand among them and keep the roomier
 * three-across label tiles. "Nearly": Clothing carries one non-brand door
 * (Nike Apparel), which must not knock the whole panel out of the wall.
 */
function isBrandWall(tiles: Array<{path?: string | null}>): boolean {
  if (tiles.length < 4) return false;
  const brands = tiles.filter((tile) => isBrandPath(tile.path)).length;
  return brands / tiles.length >= 0.75;
}

/**
 * Classes for one subcategory tile. Brand tiles trade their department tint
 * for plain white and centre their mark. Logo sizing rides on the image's
 * own `is-logo` class, so there is nothing extra to add here.
 */
function tileClass(path?: string | null): string {
  return isBrandPath(path)
    ? 'mobile-menu-tile is-brand'
    : 'mobile-menu-tile';
}

interface HeaderProps {
  header: HeaderQuery;
  cart: Promise<CartApiQueryFragment | null>;
  isLoggedIn: Promise<boolean>;
  publicStoreDomain: string;
  /**
   * Storefront API token. Only used here to tell whether <shopify-store> was
   * able to publish store context — the token itself is set on that element,
   * which PageLayout renders once for the whole page.
   */
  publicAccessToken?: string;
  selectedLocale?: I18nBase;
}

type Viewport = 'desktop' | 'mobile';

export function Header({
  header,
  isLoggedIn,
  cart,
  publicStoreDomain,
  publicAccessToken,
  selectedLocale,
}: HeaderProps) {
  const localize = useLocalizedHref();

  // Mobile: the search bar is collapsed behind a magnifier icon; tapping
  // anywhere outside the bar (or its toggle) closes it again.
  const [searchOpen, setSearchOpen] = useState(false);
  const searchFormRef = useRef<HTMLFormElement>(null);
  const searchToggleRef = useRef<HTMLButtonElement>(null);

  // Closing the bar while focus is inside it would silently drop focus to
  // <body> (the bar becomes display:none on mobile) — hand it back to the
  // toggle so keyboard users keep their place.
  const closeSearch = () => {
    if (searchFormRef.current?.contains(document.activeElement)) {
      searchToggleRef.current?.focus();
    }
    setSearchOpen(false);
  };

  useEffect(() => {
    if (!searchOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (searchFormRef.current?.contains(event.target)) return;
      if (searchToggleRef.current?.contains(event.target)) return;
      setSearchOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () =>
      document.removeEventListener('pointerdown', handlePointerDown);
  }, [searchOpen]);

  // On phones the brand/search/icons row slides out of view as the page
  // scrolls, leaving the category strip pinned — done purely with a
  // negative sticky offset (see .header in app.css), so there is no scroll
  // listener and no threshold for the layout to flicker across. All this
  // does is keep the offset matched to the row's real height.
  const headerRef = useRef<HTMLElement>(null);
  const mainRowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const header = headerRef.current;
    const row = mainRowRef.current;
    if (!header || !row || typeof ResizeObserver === 'undefined') return;
    const apply = () => {
      // Border box, not `contentRect` — that one excludes the row's vertical
      // padding, which left a sliver of the logo peeking under the strip.
      const height = Math.round(row.getBoundingClientRect().height);
      if (height > 0) {
        header.style.setProperty('--header-main-h', `${height}px`);
      }
    };
    // No direct `apply()`: the observer reports once on `observe`, after
    // layout, so the measurement costs nothing. From this effect it forced a
    // synchronous layout of the page just hydrated. The offset only matters
    // once the page has scrolled, which cannot have happened yet.
    const observer = new ResizeObserver(apply);
    observer.observe(row);
    // Web fonts land after first paint and change the row's height.
    void document.fonts?.ready.then(apply).catch(() => null);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <AnnouncementBar />
      <header className="header" ref={headerRef}>
        <div className="header-main" ref={mainRowRef}>
          {/* Mobile burger sits on the left, next to the logo (hidden ≥48em) */}
          <HeaderMenuMobileToggle />
          <NavLink
            prefetch="intent"
            to={localize('/')}
            className="header-brand"
            end
          >
            <img
              src="/vespera-logo.png"
              alt=""
              className="header-brand-logo"
              width="280"
              height="219"
            />
            <span className="header-brand-name">
              <span className="header-brand-top">{BRAND_LOCKUP.top}</span>
              <span className="header-brand-sub">{BRAND_LOCKUP.sub}</span>
            </span>
          </NavLink>

          <HeaderSearch
            isOpen={searchOpen}
            formRef={searchFormRef}
            onClose={closeSearch}
          />

          <HeaderCtas
            isLoggedIn={isLoggedIn}
            cart={cart}
            selectedLocale={selectedLocale}
            searchOpen={searchOpen}
            searchToggleRef={searchToggleRef}
            onToggleSearch={() => setSearchOpen((open) => !open)}
            publicAccessToken={publicAccessToken}
          />
        </div>
        {/* Desktop only. Mobile navigates through the burger drawer alone —
            the old pill strip repeated the same departments a tap away and
            cost a row of height on every page. */}
        <HeaderMenu
          viewport="desktop"
          primaryDomainUrl={header.shop.primaryDomain.url}
          publicStoreDomain={publicStoreDomain}
        />
      </header>
    </>
  );
}

/**
 * Rotating announcement bar (myhairshop/MERA-style): one message at a time,
 * auto-advances, arrows to browse, pauses on hover.
 */
function AnnouncementBar() {
  const t = useTranslate();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const promo = usePromoCountdown();

  const announcements = [
    // The campaign leads the rotation while it runs, and removes itself the
    // second it expires — `usePromoCountdown` returns null past the end time,
    // so there is no stale "20% off" left advertising a dead code.
    ...(promo
      ? [
          `🔥 ${t('{percent}% off everything with code {code} · ends in {time}')
            .replace('{percent}', String(PROMO.percent))
            .replace('{code}', PROMO.code)
            .replace('{time}', formatPromoTime(promo))}`,
        ]
      : []),
    `⚡ ${t('Free Shipping Worldwide')}`,
    `👟 ${t('All sneakers: 2nd pair {percent}% off').replace(
      '{percent}',
      String(SECOND_PAIR.percent),
    )}`,
    `✦ ${t('Sourced from partners — every item 100% authentic')}`,
    `↩ ${t('{days}-day returns · secure checkout').replace(
      '{days}',
      String(SHOP.returnDays),
    )}`,
    `💳 ${t('Pay in installments with Klarna at checkout')}`,
  ];

  // The promo entering or leaving changes the list length under the index.
  if (index >= announcements.length) setIndex(0);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(
      () => setIndex((current) => (current + 1) % announcements.length),
      5000,
    );
    return () => clearInterval(timer);
  }, [paused, announcements.length]);

  const step = (direction: 1 | -1) =>
    setIndex(
      (current) =>
        (current + direction + announcements.length) % announcements.length,
    );

  return (
    <div
      className="announcement-bar"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="announcement-inner announcement-rotator">
        <button
          type="button"
          className="announcement-arrow reset"
          aria-label={t('Previous announcement')}
          onClick={() => step(-1)}
        >
          ‹
        </button>
        <span className="announcement-message" key={index} aria-live="polite">
          {announcements[index]}
        </span>
        <button
          type="button"
          className="announcement-arrow reset"
          aria-label={t('Next announcement')}
          onClick={() => step(1)}
        >
          ›
        </button>
      </div>
    </div>
  );
}

/**
 * Header search with live Shopify predictive suggestions in a dropdown
 * attached to the bar (no side panel). Enter / the magnifier submits the
 * plain GET form to the full /search results page. On mobile the bar is
 * collapsed behind the magnifier icon (`isOpen`).
 */
function HeaderSearch({
  isOpen,
  formRef,
  onClose,
}: {
  isOpen: boolean;
  formRef: React.RefObject<HTMLFormElement>;
  onClose: () => void;
}) {
  const t = useTranslate();
  const localize = useLocalizedHref();
  const location = useLocation();
  const fetcher = useFetcher<PredictiveSearchReturn>();
  const [term, setTerm] = useState('');
  const [showSuggest, setShowSuggest] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchAction = localize('/search');

  // Focus the input when the mobile bar expands.
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // Every close path must also cancel a pending debounce timer, otherwise
  // it fires ~200ms later and pops the dropdown right back open.
  const cancelPendingSuggest = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  };

  // Close on outside click/tap and after any navigation.
  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (
        formRef.current &&
        event.target instanceof Node &&
        !formRef.current.contains(event.target)
      ) {
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
        setShowSuggest(false);
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () =>
      document.removeEventListener('pointerdown', handlePointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cancelPendingSuggest();
    setShowSuggest(false);
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  // Clear any pending timer on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.currentTarget.value;
    setTerm(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setShowSuggest(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void fetcher.submit(
        {q: value, limit: '6', predictive: 'true'},
        {method: 'GET', action: searchAction},
      );
      setShowSuggest(true);
    }, 200);
  }

  const data = fetcher.data;
  // Only trust a payload that matches the CURRENT input — otherwise the
  // dropdown briefly shows the previous term's results (or a false
  // "No results") while the new fetch is in flight.
  const predictive =
    data?.type === 'predictive' && data.term === term.trim()
      ? data
      : undefined;
  const products = predictive?.result.items.products ?? [];
  const total = predictive?.result.total ?? 0;
  const suggestOpen = showSuggest && Boolean(term.trim()) && Boolean(predictive);

  return (
    <Form
      ref={formRef}
      method="get"
      action={searchAction}
      className={`header-search${isOpen ? ' is-open' : ''}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          cancelPendingSuggest();
          setShowSuggest(false);
          onClose();
        }
      }}
    >
      <input
        ref={inputRef}
        type="search"
        name="q"
        placeholder={t('Search a product or brand...')}
        aria-label={t('Search')}
        autoComplete="off"
        role="combobox"
        aria-expanded={suggestOpen}
        aria-controls="header-search-suggest"
        aria-autocomplete="list"
        value={term}
        onChange={handleChange}
        onFocus={() => {
          if (term.trim() && predictive) setShowSuggest(true);
        }}
      />
      <button type="submit" aria-label={t('Search')}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path
            d="m20 20-3-3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {suggestOpen && predictive ? (
        <div
          className="search-suggest"
          id="header-search-suggest"
          role="listbox"
          aria-label={t('Search suggestions')}
        >
          {total === 0 ? (
            <p className="search-suggest-empty">
              {t('No results for "{term}"').replace('{term}', term)}
            </p>
          ) : (
            <>
              <span className="search-suggest-label">{t('Products')}</span>
              <div className="search-suggest-grid">
                {products.slice(0, 6).map((product) => {
                  const variant = product.selectedOrFirstAvailableVariant;
                  const price = variant?.price;
                  const compareAt = variant?.compareAtPrice;
                  const onSale =
                    price &&
                    compareAt &&
                    parseFloat(compareAt.amount) > parseFloat(price.amount);
                  return (
                    <Link
                      key={product.id}
                      className="search-suggest-card"
                      role="option"
                      aria-selected={false}
                      to={localize(`/products/${product.handle}`)}
                      onClick={() => setShowSuggest(false)}
                    >
                      <div className="search-suggest-card-media">
                        {variant?.image ? (
                          <Image
                            data={variant.image}
                            alt={variant.image.altText || product.title}
                            sizes="200px"
                          />
                        ) : null}
                      </div>
                      <span className="search-suggest-card-title">
                        {product.title}
                      </span>
                      {price ? (
                        <span
                          className={`search-suggest-card-price${
                            onSale ? ' on-sale' : ''
                          }`}
                        >
                          <Money data={price} />
                          {onSale && compareAt ? (
                            <s>
                              <Money data={compareAt} />
                            </s>
                          ) : null}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
              <Link
                className="search-suggest-all"
                to={`${searchAction}?q=${encodeURIComponent(term)}`}
                onClick={() => setShowSuggest(false)}
              >
                {t('View all results')} →
              </Link>
            </>
          )}
        </div>
      ) : null}
    </Form>
  );
}

export function HeaderMenu({
  primaryDomainUrl,
  viewport,
  publicStoreDomain,
}: {
  primaryDomainUrl: HeaderProps['header']['shop']['primaryDomain']['url'];
  viewport: Viewport;
  publicStoreDomain: HeaderProps['publicStoreDomain'];
}) {
  const {close, type: asideType, intent, clearIntent} = useAside();
  const localize = useLocalizedHref();
  const location = useLocation();
  const t = useTranslate();

  // Mobile drawer: which category's subpanel is slid into view. The last
  // opened subpanel stays rendered (renderedSubId) so the slide-back
  // animation still shows its rows while it plays.
  const [openSubId, setOpenSubId] = useState<string | null>(null);
  const [renderedSubId, setRenderedSubId] = useState<string | null>(null);
  /**
   * Third level: which group inside the open department is drilled into.
   * Sneakers now carries ~100 links across a dozen groups, which as one flat
   * panel is unusable on a phone — so a group like "Nike" opens its own panel
   * of Dunk / Air Force 1 / Air Max rather than dumping them all inline.
   */
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [renderedGroupId, setRenderedGroupId] = useState<string | null>(null);
  // Desktop mega menu: which panel is force-closed after a click (see below).
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  if (openSubId && renderedSubId !== openSubId) setRenderedSubId(openSubId);
  if (openGroupId && renderedGroupId !== openGroupId) setRenderedGroupId(openGroupId);

  const rootPanelRef = useRef<HTMLDivElement>(null);
  const subPanelRef = useRef<HTMLDivElement>(null);
  const groupPanelRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  /**
   * The drawer's header row (see MobileMenuAside in PageLayout). A drilled
   * panel puts its "‹ Sneakers" back control THERE, on the same line as the
   * close button, instead of spending a row of the panel on it — the owner's
   * reference menu. It is a portal because the header belongs to <Aside>,
   * which knows nothing about the menu's panels. Looked up after mount, so
   * the server render and hydration both see no portal.
   */
  const [crumbSlot, setCrumbSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (viewport !== 'mobile') return;
    setCrumbSlot(document.getElementById('mobile-menu-crumb'));
  }, [viewport]);
  const prevSubIdRef = useRef<string | null>(null);
  const [stackHeight, setStackHeight] = useState<number | null>(null);

  useEffect(() => {
    setOpenSubId(null);
    setOpenGroupId(null);
  }, [location.key]);

  // The drawer never unmounts (it only hides), so reset to the root panel
  // whenever it closes — reopening must not land on a stale subpanel.
  useEffect(() => {
    if (asideType !== 'mobile') {
      setOpenSubId(null);
      setOpenGroupId(null);
    }
  }, [asideType]);

  // Leaving a department must also drop the group drilled into inside it,
  // or going back then forward again lands mid-tree.
  useEffect(() => {
    if (!openSubId) setOpenGroupId(null);
  }, [openSubId]);

  // Pin the stack's height to the visible panel so the sections below the
  // categories glide with the slide instead of snapping when panel heights
  // differ.
  useEffect(() => {
    const panel = openGroupId
      ? groupPanelRef.current
      : openSubId
        ? subPanelRef.current
        : rootPanelRef.current;
    if (!panel) return;
    const update = () => setStackHeight(panel.offsetHeight);
    // Measure at once only when a panel has just been opened, so the height
    // glides in step with the slide. On mount the drawer is closed and
    // nothing is showing: the observer's first report (after layout) is soon
    // enough, and skipping the read avoids a forced layout during hydration.
    if (openSubId || openGroupId) update();
    const observer = new ResizeObserver(update);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [openSubId, openGroupId]);

  // Hand focus to the revealed panel: the back button when a subpanel
  // opens, the originating category row when it closes. Without this,
  // keyboard focus silently drops to <body> when the panels flip.
  useEffect(() => {
    const previous = prevSubIdRef.current;
    prevSubIdRef.current = openSubId;
    if (viewport !== 'mobile') return;
    // preventScroll: focusing content that is still sliding into view must
    // not scroll the overflow-clipped stack (that would offset the panels
    // by a full panel width on top of the track's own translate).
    if (openGroupId || openSubId) {
      // One back control serves both drilled levels (it lives in the header).
      backRef.current?.focus({preventScroll: true});
    } else if (previous && asideType === 'mobile') {
      rootPanelRef.current
        ?.querySelector<HTMLButtonElement>(
          `[data-menu-item="${CSS.escape(previous)}"]`,
        )
        ?.focus({preventScroll: true});
    }
    // asideType intentionally omitted: refocusing on drawer close would
    // pull focus into the hidden drawer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSubId, openGroupId, viewport]);

  // if the url is internal, we strip the domain
  const resolvePath = (url?: string | null) => {
    if (!url) return null;
    return url.includes('myshopify.com') ||
      url.includes(publicStoreDomain) ||
      url.includes(primaryDomainUrl)
      ? new URL(url).pathname
      : url;
  };

  const items = STOREFRONT_MENU.items
    .map((item) => ({
      ...item,
      path: resolvePath(item.url),
      children: (item.items ?? [])
        .map((child) => ({
          ...child,
          path: resolvePath(child.url),
          children: (('items' in child ? child.items : undefined) ?? [])
            .map((grandchild) => ({
              ...grandchild,
              path: resolvePath(grandchild.url),
            }))
            .filter((grandchild) => grandchild.path),
        }))
        // Keep plain links AND group headers (no link, but grandchildren)
        .filter((child) => child.path || child.children.length > 0),
    }))
    .filter((item) => item.path);

  /**
   * The homepage's "See all brands" opens this drawer straight into a
   * department instead of at its root, via the aside's `intent`.
   *
   * Matched on the menu TITLE rather than an id, because the ids come from
   * Shopify and change whenever the menu is rebuilt — a title survives that.
   * The intent is consumed immediately, so the next plain tap on the burger
   * lands on the root panel again.
   */
  useEffect(() => {
    if (viewport !== 'mobile' || asideType !== 'mobile' || !intent) return;
    const target = items.find(
      (item) =>
        item.children.length > 0 &&
        item.title.trim().toLowerCase() === intent.trim().toLowerCase(),
    );
    if (target) setOpenSubId(target.id);
    clearIntent();
    // `items` is rebuilt on every render, so it cannot be a dependency without
    // re-running this on each one; the intent and the drawer state are what
    // actually gate it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, asideType, viewport]);

  if (viewport === 'mobile') {
    const activeSub =
      items.find(
        (item) => item.id === openSubId && item.children.length > 0,
      ) ?? null;
    // Kept mounted after "back" so the slide-out still shows its rows.
    const renderedSub =
      items.find(
        (item) => item.id === renderedSubId && item.children.length > 0,
      ) ?? null;
    // Mirrors the desktop split exactly: a child with a destination is a tile
    // in the grid (and drills if it has depth), a child without one is a
    // labelled shortcut strip. Same rule, same result, both viewports.
    const tilesOf = (dept: typeof renderedSub) =>
      (dept?.children ?? []).filter(
        (child) => child.path && !isRedundantAllRow(child.title),
      );
    const shortcutsOf = (dept: typeof renderedSub) =>
      (dept?.children ?? []).filter(
        (child) => !child.path && drillRows(child).length > 0,
      );
    const drillablesOf = (dept: typeof renderedSub) =>
      tilesOf(dept).filter((child) => canDrill(child));
    const activeGroup =
      drillablesOf(activeSub).find((child) => child.id === openGroupId) ?? null;
    const renderedGroup =
      drillablesOf(renderedSub).find((child) => child.id === renderedGroupId) ??
      null;
    // "‹ Sneakers" on the brand wall, "‹ Nike" inside a brand: the row names
    // the panel in view and one tap steps back out of it.
    const crumbTitle = activeGroup?.title ?? activeSub?.title ?? null;

    return (
      <nav className="header-menu-mobile" role="navigation">
        {crumbSlot && crumbTitle
          ? createPortal(
              <button
                ref={backRef}
                type="button"
                className="mobile-menu-crumb-btn reset"
                onClick={() =>
                  activeGroup ? setOpenGroupId(null) : setOpenSubId(null)
                }
              >
                <svg
                  className="mobile-menu-crumb-chevron"
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m15 5-7 7 7 7" />
                </svg>
                <span className="sr-only">{t('Back')}: </span>
                <span className="mobile-menu-crumb-title">{t(crumbTitle)}</span>
              </button>,
              crumbSlot,
            )
          : null}
        <div
          className={`mobile-menu-stack${activeSub ? ' has-sub' : ''}${
            activeGroup ? ' has-group' : ''
          }`}
          style={stackHeight === null ? undefined : {height: stackHeight}}
        >
          <div className="mobile-menu-track">
            <div
              ref={rootPanelRef}
              className="mobile-menu-panel"
              aria-hidden={Boolean(activeSub)}
            >
              {/* One grid, colour-coded by department so the eye can sort
                  them without reading. `data-cat` drives the tint. */}
              <div className="mobile-menu-tiles mobile-menu-tiles-root">
                {orderRootTiles(items).map((item) =>
                  item.children.length > 0 ? (
                    <button
                      key={item.id}
                      type="button"
                      data-menu-item={item.id}
                      data-cat={toneFor(item.title)}
                      className="mobile-menu-tile reset"
                      onClick={() => setOpenSubId(item.id)}
                    >
                      {/* No photo on this panel: one shoe cannot stand for
                          8,312 sneakers, and the thumbnail was squeezing the
                          label hard enough to break "Accessories" across two
                          lines. The departments read faster as plain words. */}
                      <span>{t(item.title)}</span>
                      <SaleMark path={item.path} />
                      <span className="menu-chevron" aria-hidden="true">
                        ›
                      </span>
                    </button>
                  ) : (
                    <NavLink
                      key={item.id}
                      end
                      data-cat={toneFor(item.title)}
                      className="mobile-menu-tile"
                      onClick={close}
                      prefetch="intent"
                      to={localize(item.path!)}
                    >
                      <span>{t(item.title)}</span>
                      <SaleMark path={item.path} />
                    </NavLink>
                  ),
                )}
                {/* A destination the Shopify menu doesn't carry */}
                <NavLink
                  end
                  data-cat="best"
                  className="mobile-menu-tile"
                  onClick={close}
                  prefetch="intent"
                  to={localize('/collections/bestsellers')}
                >
                  <span>{t('Staff picks')}</span>
                </NavLink>
              </div>
            </div>
            <div
              ref={subPanelRef}
              className="mobile-menu-panel"
              aria-hidden={!activeSub || Boolean(activeGroup)}
            >
              {renderedSub && (
                <>
                  {/* No department heading here: the "All <department>" bar
                      below already names the panel, so printing "Kids"
                      directly above "All Kids" only said it twice.
                      One grid holds every brand — the ones with silhouettes
                      carry a chevron and drill, the rest link straight
                      through. Splitting them into tiles-plus-rows made two
                      visual classes out of one kind of thing. */}
                  {/* Subcategories wear their department's tint, so the
                      whole panel reads as one colour family. */}
                  <div
                    className={`mobile-menu-tiles${
                      isBrandWall(tilesOf(renderedSub)) ? ' is-brand-wall' : ''
                    }`}
                  >
                    <NavLink
                      end
                      className="mobile-menu-tile is-accent"
                      onClick={close}
                      prefetch="intent"
                      to={localize(renderedSub.path!)}
                    >
                      {/* No thumbnail here on purpose — without one the label
                          centres across the whole tile. */}
                      <span>
                        {t('All')} {t(renderedSub.title)}
                      </span>
                    </NavLink>
                    {tilesOf(renderedSub).map((child) =>
                      canDrill(child) ? (
                        <button
                          key={child.id}
                          type="button"
                          data-menu-group={child.id}
                          data-cat={toneFor(renderedSub.title)}
                          className={`${tileClass(child.path)} reset`}
                          onClick={() => setOpenGroupId(child.id)}
                        >
                          <TileFace title={t(child.title)} path={child.path} />
                          <span className="menu-chevron" aria-hidden="true">
                            ›
                          </span>
                        </button>
                      ) : (
                        <NavLink
                          key={child.id}
                          end
                          data-cat={toneFor(renderedSub.title)}
                          className={tileClass(child.path)}
                          onClick={close}
                          prefetch="intent"
                          to={localize(child.path!)}
                        >
                          <TileFace title={t(child.title)} path={child.path} />
                        </NavLink>
                      ),
                    )}
                  </div>
                  {/* Category shortcuts, same labelled pill strip as desktop:
                      not brands, so they don't get brand tiles. */}
                  {shortcutsOf(renderedSub).map((row) => (
                    <div className="mobile-menu-shortcuts" key={row.id}>
                      <span className="mobile-menu-shortcuts-label">
                        {t(row.title)}
                      </span>
                      <div className="mobile-menu-shortcuts-links">
                        {row.children
                          .filter((link) => !isRedundantAllRow(link.title))
                          .map((link) => (
                            <NavLink
                              key={link.id}
                              end
                              className="mobile-menu-shortcut"
                              onClick={close}
                              prefetch="intent"
                              to={localize(link.path!)}
                            >
                              {t(link.title)}
                            </NavLink>
                          ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
            <div
              ref={groupPanelRef}
              className="mobile-menu-panel"
              aria-hidden={!activeGroup}
            >
              {renderedGroup && (
                <>
                  <div className="mobile-menu-tiles">
                    {/* Same "View all …" door the desktop drill opens with —
                        drilling into Nike must never hide plain Nike. */}
                    {renderedGroup.path ? (
                      <NavLink
                        end
                        className="mobile-menu-tile is-accent"
                        onClick={close}
                        prefetch="intent"
                        to={localize(renderedGroup.path)}
                      >
                        <span>
                          {t('All')} {t(renderedGroup.title)}
                        </span>
                      </NavLink>
                    ) : null}
                    {renderedGroup.children
                      .filter((link) => !isRedundantAllRow(link.title))
                      .map((link) => (
                        <NavLink
                          key={link.id}
                          end
                          data-cat={toneFor(renderedSub?.title ?? '')}
                          className={tileClass(link.path)}
                          onClick={close}
                          prefetch="intent"
                          to={localize(link.path!)}
                        >
                          <TileFace title={t(link.title)} path={link.path} />
                        </NavLink>
                      ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>
    );
  }

  // Desktop: items with children get a hover/focus dropdown. Items whose
  // children are grouped (3 levels) get the brand grid, which drills into a
  // second panel rather than printing every column at once.
  return (
    <nav className="header-menu-desktop" role="navigation">
      {items.map((item) => {
        // The panel opens on :hover, so after following a link the pointer is
        // still inside it and CSS would keep it open over the newly loaded
        // page. Flag the item as dismissed, which overrides the hover rule.
        const dismiss = () => {
          close();
          setDismissedId(item.id);
        };
        // Re-arm on the way IN, not on the way out. Clearing the flag when the
        // pointer leaves looks equivalent but isn't: the panel is
        // pointer-events:none while dismissed, so the pointer "leaves" the
        // moment the click lands, while it is still sitting inside the box the
        // panel occupied — and the next twitch of the mouse hovers the item
        // again and re-opens it. Waiting for a fresh enter means the panel
        // stays shut until the shopper deliberately comes back to the menu.
        // onFocus covers the keyboard, where :focus-within plays hover's role.
        const rearm = () => {
          if (dismissedId === item.id) setDismissedId(null);
        };
        const hasChildren = item.children.length > 0;
        const isMega = item.children.some(
          (child) => child.children.length > 0,
        );
        const promo = MEGA_PROMOS[item.title];
        return (
          <div
            key={item.id}
            className={`header-menu-item-wrap${
              hasChildren ? ' has-submenu' : ''
            }${dismissedId === item.id ? ' is-dismissed' : ''}`}
            onMouseEnter={rearm}
            onFocus={rearm}
          >
            <NavLink
              className="header-menu-item"
              end
              onClick={dismiss}
              prefetch="intent"
              style={activeLinkStyle}
              to={localize(item.path!)}
            >
              {t(item.title)}
              {hasChildren && (
                <span className="header-menu-caret" aria-hidden="true">
                  ▾
                </span>
              )}
            </NavLink>
            {hasChildren && isMega && (
              <div className="header-submenu header-mega">
                <MegaBrandGrid
                  item={item}
                  promoCount={promo ? 1 : 0}
                  localize={localize}
                  onNavigate={dismiss}
                />
                {promo ? (
                  <Link
                    className="header-mega-promo"
                    prefetch="intent"
                    onClick={dismiss}
                    to={localize(promo.to)}
                  >
                    <img src={promo.image} alt="" loading="lazy" />
                    <span className="header-mega-promo-overlay">
                      <strong>{t(promo.title)}</strong>
                      <span className="header-mega-promo-cta">
                        {t(promo.cta)} →
                      </span>
                    </span>
                  </Link>
                ) : null}
              </div>
            )}
            {hasChildren && !isMega && (
              <div className="header-submenu">
                {item.children.map((child) => (
                  <NavLink
                    key={child.id}
                    className="header-submenu-link"
                    prefetch="intent"
                    onClick={dismiss}
                    to={localize(child.path!)}
                  >
                    {t(child.title)}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/**
 * Photo promo card on the right of a mega-menu panel (matched by menu item
 * title) — same lifestyle imagery as the homepage category tiles. Remove an
 * entry to drop the card.
 */
const MEGA_PROMOS: Record<
  string,
  {image: string; title: string; cta: string; to: string}
> = {
  Men: {
    image: '/category-tshirts.jpg',
    title: 'Fits for every day.',
    cta: 'Shop men',
    to: '/collections/men',
  },
  Women: {
    image: '/category-jackets.jpg',
    title: 'Layers & heat.',
    cta: 'Shop women',
    to: '/collections/women',
  },
  Kids: {
    image: '/category-kids.jpg',
    title: 'Mini fits, real heat.',
    cta: 'Shop kids',
    to: '/collections/kids',
  },
  Sneakers: {
    image: '/category-sneakers.jpg',
    title: 'Grails on rotation.',
    cta: 'New drops',
    to: '/collections/sneakers?sort_by=newest',
  },
};

function HeaderCtas({
  isLoggedIn,
  cart,
  selectedLocale,
  searchOpen,
  searchToggleRef,
  onToggleSearch,
  publicAccessToken,
}: Pick<HeaderProps, 'isLoggedIn' | 'cart' | 'selectedLocale'> & {
  searchOpen: boolean;
  searchToggleRef: React.RefObject<HTMLButtonElement>;
  onToggleSearch: () => void;
  publicAccessToken?: string;
}) {
  const t = useTranslate();
  return (
    <nav className="header-ctas" role="navigation">
      {/* Settings first, then actions: language and currency say what the
          page is, while search, favourites and cart are things you do to
          it. One control, not two — see LocaleMenu for why. */}
      <div className="header-currency">
        <LocaleMenu selectedLocale={selectedLocale} />
      </div>
      <button
        ref={searchToggleRef}
        type="button"
        className="header-icon-link header-search-toggle reset"
        aria-label={t('Search')}
        aria-expanded={searchOpen}
        onClick={onToggleSearch}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path
            d="m20 20-3-3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {/* Hidden on phones (see CSS) — account lives in the burger menu */}
      <div className="header-account">
        <AccountMenu
          isLoggedIn={isLoggedIn}
          hasStoreContext={Boolean(publicAccessToken)}
        />
      </div>
      <FavoritesLink />
      <CartToggle cart={cart} />
    </nav>
  );
}

/**
 * Account entry point.
 *
 * Sign-in runs through Shopify's <shopify-account> component, which opens a
 * sheet in place. The old behaviour handed the customer off to Shopify's
 * hosted login page on the checkout domain — and anyone who changed their
 * mind there had no way back, because that page's own brand link points at
 * the Online Store, not this storefront.
 *
 * The slotted content must NOT be interactive. Shopify renders the slot
 * inside its own `<button part="signed-out-avatar">`, so a link in there
 * both nests an anchor in a button and wins the click — which navigated
 * straight to the hosted page the component exists to avoid. Icon only.
 */
function AccountMenu({
  isLoggedIn,
  hasStoreContext,
}: Pick<HeaderProps, 'isLoggedIn'> & {hasStoreContext: boolean}) {
  // Without a Storefront API token there is no store context for the
  // component to read, so fall back to the plain link rather than render a
  // control that silently does nothing.
  if (!hasStoreContext) {
    return (
      <Suspense fallback={<AccountDropdown />}>
        <Await resolve={isLoggedIn} errorElement={<AccountDropdown />}>
          {(loggedIn) => (loggedIn ? <AccountLink /> : <AccountDropdown />)}
        </Await>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<SignInSheet />}>
      <Await resolve={isLoggedIn} errorElement={<SignInSheet />}>
        {(loggedIn) => (loggedIn ? <SignedInMenu /> : <SignInSheet />)}
      </Await>
    </Suspense>
  );
}

/**
 * Signed out: Shopify's own component. Clicking the icon opens its sign-in
 * sheet in place rather than handing the customer to Shopify's hosted login
 * page, which has no way back to this storefront.
 *
 * The slotted content must NOT be interactive — Shopify renders the slot
 * inside its own `<button part="signed-out-avatar">`, so a link in there
 * nests an anchor in a button and wins the click.
 */
function SignInSheet() {
  return (
    <shopify-account
      menu="customer-account-main-menu"
      sign-in-url="/account/login"
    >
      <span slot="signed-out-avatar" className="header-icon-link">
        <AccountIcon label="Sign in" />
      </span>
    </shopify-account>
  );
}

/**
 * Signed in: our own panel rather than Shopify's sheet.
 *
 * The sheet's menu lives in a shadow root that exposes only colours, fonts
 * and radii — a two-up row over full-width bars is not expressible there.
 * It also renders the same items to signed-out visitors, so a Sign out entry
 * would show to people who are not signed in. Owning this panel is what
 * makes both of those work.
 */
function SignedInMenu() {
  const t = useTranslate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (wrapRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="header-account-menu" ref={wrapRef}>
      <button
        type="button"
        className="header-icon-link reset"
        aria-label={t('Account')}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <AccountIcon />
      </button>
      {open ? (
        <div className="header-account-panel">
          <AccountMenuLinks onNavigate={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * The signed-in links, shared by the header panel and the mobile drawer.
 * Orders and Profile pair up on one row; Track order and Sign out each take
 * the full width, with Sign out last and in red as the destructive action.
 */
function AccountMenuLinks({onNavigate}: {onNavigate?: () => void}) {
  const localize = useLocalizedHref();
  return (
    <div className="account-links">
      <NavLink
        className="account-link"
        to={localize('/account/orders')}
        onClick={onNavigate}
        prefetch="intent"
      >
        Orders
      </NavLink>
      <NavLink
        className="account-link"
        to={localize('/account/profile')}
        onClick={onNavigate}
        prefetch="intent"
      >
        Profile
      </NavLink>
      <NavLink
        className="account-link"
        to={localize('/pages/track-order')}
        onClick={onNavigate}
        prefetch="intent"
      >
        Track order
      </NavLink>
      {/* A POST, not a link: signing out changes state, and this keeps the
          logout route from having to honour a bare GET. */}
      <Form method="post" action={localize('/account/logout')}>
        <button type="submit" className="account-link is-danger">
          Sign out
        </button>
      </Form>
    </div>
  );
}

function AccountLink() {
  const t = useTranslate();
  const localize = useLocalizedHref();
  return (
    <NavLink
      prefetch="intent"
      to={localize('/account')}
      style={activeLinkStyle}
      className="header-icon-link"
      aria-label={t('Account')}
      title="Account"
    >
      <AccountIcon />
    </NavLink>
  );
}

function AccountDropdown() {
  const localize = useLocalizedHref();
  // Shopify's hosted, passwordless flow handles both sign-in and sign-up on
  // the same screen, so a single entry is the honest UX.
  const label = 'Sign in or create account';
  return (
    <NavLink
      prefetch="intent"
      to={localize('/account/login')}
      className="header-icon-link"
      aria-label={label}
      title={label}
    >
      <AccountIcon title={label} />
    </NavLink>
  );
}

function FavoritesLink() {
  const localize = useLocalizedHref();
  const favorites = useWishlist();
  const count = favorites.size;
  return (
    <NavLink
      prefetch="intent"
      to={localize('/favorites')}
      style={activeLinkStyle}
      className="header-icon-link"
      aria-label="Favorites"
      title="Favorites"
    >
      <FavoritesIcon />
      {count > 0 && <span className="header-cart-count">{count}</span>}
    </NavLink>
  );
}

/**
 * "All men" / "All women" / "All kids" style rows duplicate the synthetic
 * "All in {category}" row the mobile menu already renders. (Word-boundary
 * check, so brand names like "Allbirds" are untouched.)
 */
function isRedundantAllRow(title: string): boolean {
  return /^all(\s|$)/i.test(title.trim());
}

/**
 * The rows a drill-down would actually show, once the "All …" duplicates are
 * dropped — every panel already opens with its own "All <brand>" link.
 */
function drillRows<T extends {title: string}>(node?: {children?: T[] | null}): T[] {
  return (node?.children ?? []).filter((row) => !isRedundantAllRow(row.title));
}

/**
 * A tile earns a drill-down only if it has at least two rows behind it.
 *
 * With one row the panel offers "All BAPE" and "T-Shirts" — a tap that buys a
 * single link, and which reads as a dead tile because the click appears to do
 * nothing. Those brands link straight to their own page instead, where the
 * sub-category is reachable through the filters anyway.
 */
function canDrill(node?: {children?: {title: string}[] | null}): boolean {
  return drillRows(node).length >= 2;
}

/**
 * Maps a department name to its tint in the mobile drawer. Unknown titles
 * fall through to the neutral grey tile, so a new menu entry never lands
 * with a broken colour.
 */
/**
 * Column layout for the drawer's root tiles, independent of the header strip.
 *
 * The grid fills left-to-right, so getting two readable columns means
 * interleaving them in the DOM: the departments people shop by person go down
 * the left (Men / Women / Kids), the ones they shop by product down the right
 * (Brands / Sneakers / Essentials). Anything not listed — Sale, Bestsellers —
 * keeps its place at the end, since the sort is stable.
 */
const ROOT_TILE_ORDER = ['Sneakers', 'Clothing', 'Accessories', 'Women', 'Kids'];

function orderRootTiles<T extends {title: string}>(items: T[]): T[] {
  const rank = (title: string) => {
    const index = ROOT_TILE_ORDER.indexOf(title.trim());
    return index === -1 ? ROOT_TILE_ORDER.length : index;
  };
  return [...items].sort((a, b) => rank(a.title) - rank(b.title));
}

/**
 * Only Sale is tinted now. Giving each department its own hue meant a panel
 * of brands arrived as six competing pastels with the product photos fighting
 * them, and the colour carried no information — a shopper cannot learn that
 * mint means Kids. One neutral surface throughout lets the photograph and the
 * label do the identifying, and leaves the single red tile actually meaning
 * something.
 */
function toneFor(title: string): string | undefined {
  return /^sale\b/.test(title.trim().toLowerCase()) ? 'sale' : undefined;
}


function HeaderMenuMobileToggle() {
  const {open} = useAside();
  const t = useTranslate();
  return (
    <button
      className="header-menu-mobile-toggle reset"
      onClick={() => open('mobile')}
      aria-label={t('Open menu')}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M3 6h18M3 12h18M3 18h18"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

function FavoritesIcon() {
  return (
    <span className="header-icon-inner" aria-hidden="true">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/**
 * `label` only where nothing around the icon names it — the signed-out slot
 * inside <shopify-account>, whose button we don't render. There it becomes
 * role="img" with the label, which ARIA permits. Everywhere else the parent
 * link/button already carries aria-label, so the icon is hidden: a bare span
 * with aria-label fails "Elements must only use permitted ARIA attributes"
 * (PageSpeed, 24 Sep 2026).
 */
function AccountIcon({label, title}: {label?: string; title?: string}) {
  return (
    <span
      className="header-icon-inner"
      // Hover tooltip kept on every variant, exactly as before.
      title={title ?? label ?? 'Account'}
      {...(label
        ? {role: 'img', 'aria-label': label}
        : {'aria-hidden': true})}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
        <path
          d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function CartBadge({count}: {count: number}) {
  const {open} = useAside();
  const {publish, shop, cart, prevCart} = useAnalytics();
  const localize = useLocalizedHref();

  // Bounce the basket whenever the item count goes up.
  const previousCount = useRef(count);
  const [bump, setBump] = useState(false);
  useEffect(() => {
    if (count > previousCount.current) {
      setBump(true);
      const timeout = setTimeout(() => setBump(false), 600);
      previousCount.current = count;
      return () => clearTimeout(timeout);
    }
    previousCount.current = count;
  }, [count]);

  return (
    <a
      href={localize('/cart')}
      className={`header-icon-link header-cart${bump ? ' cart-bump' : ''}`}
      aria-label={`Cart, ${count} items`}
      onClick={(e) => {
        e.preventDefault();
        open('cart');
        publish('cart_viewed', {
          cart,
          prevCart,
          shop,
          url: window.location.href || '',
        } as CartViewPayload);
      }}
    >
      <BsBasket3 size={20} aria-hidden="true" />
      {count > 0 && <span className="header-cart-count">{count}</span>}
    </a>
  );
}

function CartToggle({cart}: Pick<HeaderProps, 'cart'>) {
  return (
    <Suspense fallback={<CartBadge count={0} />}>
      <Await resolve={cart} errorElement={<CartBadge count={0} />}>
        <CartBanner />
      </Await>
    </Suspense>
  );
}

function CartBanner() {
  const originalCart = useAsyncValue() as CartApiQueryFragment | null;
  const cart = useOptimisticCart(originalCart);
  return (
    <div className="header-cart-wrap">
      <CartBadge count={cart?.totalQuantity ?? 0} />
      <MiniCart cart={cart} />
    </div>
  );
}

/**
 * Small basket preview that drops down when hovering the cart icon on
 * desktop (Zalando-style): a few compact lines, shipping + total rows and
 * a button to the full cart. On touch screens the cart drawer opens
 * instead, so the popover is desktop-only (see CSS).
 */
const MINI_CART_MAX_LINES = 3;

function MiniCart({cart}: {cart: OptimisticCart<CartApiQueryFragment | null>}) {
  const t = useTranslate();
  const localize = useLocalizedHref();
  const lines = (cart?.lines?.nodes ?? []).filter(
    (line) =>
      !('parentRelationship' in line && line.parentRelationship?.parent),
  );
  const count = cart?.totalQuantity ?? 0;
  const subtotal = cart?.cost?.subtotalAmount;
  const freeShipping = Boolean(
    subtotal?.amount &&
      subtotal.currencyCode === SHOP.freeShipping.currency &&
      parseFloat(subtotal.amount) >= SHOP.freeShipping.amount,
  );

  return (
    <div className="mini-cart" role="group" aria-label="Cart preview">
      <p className="mini-cart-title">{t('Your cart')}</p>
      {lines.length === 0 ? (
        <p className="mini-cart-empty">Your cart is empty.</p>
      ) : (
        <>
          <ul className="mini-cart-lines">
            {lines.slice(0, MINI_CART_MAX_LINES).map((line) => (
              <MiniCartLine key={line.id} line={line} />
            ))}
          </ul>
          {lines.length > MINI_CART_MAX_LINES ? (
            <p className="mini-cart-more">
              +{lines.length - MINI_CART_MAX_LINES} more{' '}
              {lines.length - MINI_CART_MAX_LINES === 1 ? 'item' : 'items'}
            </p>
          ) : null}
          <div className="mini-cart-totals">
            <p className="mini-cart-row">
              <span>Shipping</span>
              <span>{freeShipping ? 'Free' : 'At checkout'}</span>
            </p>
            <p className="mini-cart-row mini-cart-total">
              <span>Total</span>
              <strong>{subtotal?.amount ? <Money data={subtotal} /> : '—'}</strong>
            </p>
          </div>
          <Link className="mini-cart-btn" to={localize('/cart')}>
            View cart{count > 0 ? ` (${count})` : ''}
          </Link>
        </>
      )}
    </div>
  );
}

function MiniCartLine({
  line,
}: {
  line: NonNullable<
    OptimisticCart<CartApiQueryFragment | null>['lines']
  >['nodes'][number];
}) {
  const cartRoute = useLocalePrefix() + '/cart';
  const localize = useLocalizedHref();
  const t = useTranslate();
  const {merchandise, quantity} = line;
  const {product, image, selectedOptions} = merchandise;
  const {brand, rest} = splitBrandTitle(product.title);
  const size = (selectedOptions ?? []).find(
    (option) => option.value !== 'Default Title',
  );
  const serverTotal = line.cost?.totalAmount;
  const unitPrice = line.cost?.amountPerQuantity;
  const unitCompare = line.cost?.compareAtAmountPerQuantity;
  const lineSubtotal =
    line.cost && 'subtotalAmount' in line.cost
      ? (
          line.cost as {
            subtotalAmount?: NonNullable<typeof line.cost>['totalAmount'];
          }
        ).subtotalAmount
      : undefined;

  // Original vs discounted: automatic deal (line total < line subtotal)
  // wins; otherwise a compare-at sale price.
  const discounted = Boolean(
    serverTotal &&
      lineSubtotal &&
      parseFloat(serverTotal.amount) <
        parseFloat(lineSubtotal.amount) - 0.001,
  );

  // unit × quantity stays consistent while optimistic quantity updates
  // wait for the server (cost amounts lag one round-trip).
  const total =
    !discounted && unitPrice?.amount && typeof quantity === 'number'
      ? {
          amount: (parseFloat(unitPrice.amount) * quantity).toFixed(2),
          currencyCode: unitPrice.currencyCode,
        }
      : serverTotal;
  const onSale =
    discounted ||
    Boolean(
      unitPrice &&
        unitCompare &&
        parseFloat(unitCompare.amount) > parseFloat(unitPrice.amount),
    );
  const compareTotal = discounted
    ? (lineSubtotal ?? null)
    : onSale && unitCompare && typeof quantity === 'number'
      ? {
          amount: (parseFloat(unitCompare.amount) * quantity).toFixed(2),
          currencyCode: unitCompare.currencyCode,
        }
      : null;

  return (
    <li className="mini-cart-line">
      <Link
        className="mini-cart-media"
        to={localize(`/products/${product.handle}`)}
        tabIndex={-1}
        aria-hidden="true"
      >
        {image ? (
          <Image
            data={image}
            alt={image.altText || product.title}
            width={56}
            height={56}
            loading="lazy"
          />
        ) : null}
      </Link>
      <div className="mini-cart-line-body">
        {brand ? <span className="mini-cart-brand">{brand}</span> : null}
        <Link
          className="mini-cart-name"
          to={localize(`/products/${product.handle}`)}
        >
          {rest}
        </Link>
        <span className={`mini-cart-price${onSale ? ' on-sale' : ''}`}>
          {total ? <Money data={total} /> : null}
          {compareTotal ? (
            <s className="mini-cart-compare">
              <Money data={compareTotal} />
            </s>
          ) : null}
        </span>
        <span className="mini-cart-meta">
          {size ? `${t(displayOptionName(size.name))}: ${size.value} · ` : ''}
          {t('Qty:')} {quantity}
        </span>
      </div>
      <CartForm
        route={cartRoute}
        action={CartForm.ACTIONS.LinesRemove}
        inputs={{lineIds: [line.id]}}
      >
        <button
          className="mini-cart-remove"
          type="submit"
          aria-label="Remove item"
          title="Remove item"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </CartForm>
    </li>
  );
}

// The storefront's navigation lives here, in code — not in the Shopify admin
// menu. The admin menu is a flat list of links: it cannot express the
// department tints, brand logos, grouped subpanels or ordering this drawer is
// built on, and the Online Store theme on the checkout domain uses it for its
// own nav. Deferring to it meant that adding one link in admin silently
// replaced the entire storefront navigation. Handles must match the
// collections listed in SHOPIFY_SETUP.md.
interface FallbackMenuItem {
  id: string;
  resourceId: null;
  tags: string[];
  title: string;
  type: string;
  url: string;
  items: FallbackMenuItem[];
}

function fallbackItem(
  path: string,
  title: string,
  children: FallbackMenuItem[] = [],
): FallbackMenuItem {
  return {
    id: `fallback-${(path || title).replace(/[^a-z0-9]+/gi, '-')}-${title
      .replace(/[^a-z0-9]+/gi, '-')
      .toLowerCase()}`,
    resourceId: null,
    tags: [],
    title,
    type: 'HTTP',
    url: path,
    items: children,
  };
}

/** Column group inside a mega menu — a heading with links, no link itself. */
function fallbackGroup(
  title: string,
  children: FallbackMenuItem[],
): FallbackMenuItem {
  return fallbackItem('', title, children);
}

/**
 * Brand quick-links point at real smart collections in Shopify (rules match
 * the brand name in product titles), so every brand page is guaranteed to
 * have products — no dependency on the search index.
 */
const BRAND_COLLECTIONS: Record<string, string> = {
  'Jordan': 'jordan',
  'Nike': 'nike',
  'New Balance': 'new-balance',
  'ASICS': 'asics',
  'adidas': 'adidas',
  'UGG': 'ugg-boots-slippers',
  'Travis Scott': 'travis-scott',
  'Stussy': 'stussy',
  'Corteiz': 'corteiz',
  'Essentials': 'essentials',
  'Syna World': 'syna-world',
  'Represent': 'represent',
  'AMI Paris': 'ami-paris',
  'Denim Tears': 'denim-tears',
  'Sp5der': 'sp5der',
  'Gallery Dept': 'gallery-dept',
  'Supreme': 'supreme',
  'On Running': 'on-running',
  'Jacquemus': 'jacquemus',
  'Puma': 'puma',
  'Salomon': 'salomon',
  'Crocs': 'crocs',
  'Vans': 'vans',
  'Converse': 'converse',
  'Saucony': 'saucony',
  'Maison Mihara Yasuhiro': 'maison-mihara-yasuhiro',
  'Vale Forever': 'vale-forever',
  'Yeezy': 'yeezy',
  'Timberland': 'timberland',
  'Birkenstock': 'birkenstock',
  'HOKA': 'hoka',
  'Onitsuka Tiger': 'onitsuka-tiger',
  'Under Armour': 'under-armour',
  'Comme des Garçons': 'comme-des-garcons',
  'Hellstar': 'hellstar',
  'Vlone': 'vlone',
  'Godspeed': 'godspeed',
  'BAPE': 'bape',
};

function brandLink(brand: string): FallbackMenuItem {
  const handle = BRAND_COLLECTIONS[brand];
  return fallbackItem(
    handle
      ? `/collections/${handle}`
      : `/search?q=${encodeURIComponent(brand)}`,
    brand,
  );
}

// Women's apparel is genuinely small (38 products), so this leans on the
// footwear and bags that actually have depth rather than listing empty rows.
const WOMEN_MENU_ITEM = fallbackItem('/collections/women', 'Women', [
  fallbackGroup('Shoes', [
    fallbackItem('/collections/women-sneakers', 'Sneakers'),
    fallbackItem('/collections/women-boots', 'Boots'),
    fallbackItem('/collections/women-slippers', 'Slippers & Slides'),
  ]),
  fallbackGroup('Clothing & bags', [
    fallbackItem('/collections/women-clothing', 'Clothing'),
    fallbackItem('/collections/women-bags', 'Bags'),
    fallbackItem('/collections/flare-jeans', 'Flared Denim'),
  ]),
  fallbackGroup('More', [
    fallbackItem('/collections/ugg-boots-slippers', 'UGG'),
    fallbackItem('/collections/sale-women', 'Sale'),
  ]),
]);

const KIDS_MENU_ITEM = fallbackItem('/collections/kids', 'Kids', [
  fallbackGroup('Shop by size', [
    fallbackItem('/collections/kids-gs', 'Grade School (GS)'),
    fallbackItem('/collections/kids-ps', 'Pre-School (PS)'),
    fallbackItem('/collections/kids-td', 'Toddler (TD)'),
  ]),
]);

/**
 * Apparel as a department in its own right. Without this, clothing is only
 * reachable through Men, Women or Essentials — which hides 1,150 products
 * from anyone browsing the whole range.
 */
/** Clothing mirrors Sneakers: brands first, each carrying its own garments. */
const CLOTHING_MENU_ITEM = fallbackItem('/collections/clothing', 'Clothing', [
  fallbackItem('/collections/essentials', 'Fear of God Essentials', [
    fallbackItem('/collections/essentials-sets', 'Sets'),
    fallbackItem('/collections/essentials-hoodies', 'Hoodies'),
    fallbackItem('/collections/essentials-tees', 'T-Shirts'),
    fallbackItem('/collections/essentials-pants', 'Pants'),
    fallbackItem('/collections/essentials-shorts', 'Shorts'),
    fallbackItem('/collections/essentials-jackets', 'Jackets'),
    fallbackItem('/collections/essentials-winter', 'Winter Collection'),
    fallbackItem('/collections/essentials-summer', 'Summer Collection'),
  ]),
  fallbackItem('/collections/supreme', 'Supreme', [
    fallbackItem('/collections/supreme-t-shirts', 'T-Shirts'),
    fallbackItem('/collections/supreme-hoodies', 'Hoodies'),
    // No Shirts row: /collections/supreme-shirts holds 0 products.
    fallbackItem('/collections/supreme-jackets', 'Jackets'),
    fallbackItem('/collections/supreme-pants', 'Pants'),
    fallbackItem('/collections/supreme-accessories', 'Accessories'),
  ]),
  fallbackItem('/collections/stussy', 'Stussy', [
    fallbackItem('/collections/stussy-t-shirts', 'T-Shirts'),
    fallbackItem('/collections/stussy-hoodies', 'Hoodies'),
    // No Shirts row: /collections/stussy-shirts holds 0 products.
  ]),
  fallbackItem('/collections/sp5der', 'Sp5der', [
    fallbackItem('/collections/sp5der-hoodies', 'Hoodies'),
    fallbackItem('/collections/sp5der-t-shirts', 'T-Shirts'),
    fallbackItem('/collections/sp5der-pants', 'Pants'),
  ]),
  fallbackItem('/collections/denim-tears', 'Denim Tears', [
    fallbackItem('/collections/denim-tears-pants', 'Pants'),
    fallbackItem('/collections/denim-tears-hoodies', 'Hoodies'),
    fallbackItem('/collections/denim-tears-shorts', 'Shorts'),
  ]),
  fallbackItem('/collections/travis-scott', 'Travis Scott', [
    fallbackItem('/collections/travis-scott-t-shirts', 'T-Shirts'),
    fallbackItem('/collections/travis-scott-hoodies', 'Hoodies'),
  ]),
  fallbackItem('/collections/vale-forever', 'Vale Forever', [
    fallbackItem('/collections/vale-forever-hoodies', 'Hoodies'),
    fallbackItem('/collections/vale-forever-t-shirts', 'T-Shirts'),
  ]),
  fallbackItem('/collections/godspeed', 'Godspeed', [
    fallbackItem('/collections/godspeed-hoodies', 'Hoodies'),
    fallbackItem('/collections/godspeed-t-shirts', 'T-Shirts'),
  ]),
  fallbackItem('/collections/bape', 'BAPE', [
    fallbackItem('/collections/bape-t-shirts', 'T-Shirts'),
  ]),
  fallbackItem('/collections/vlone', 'Vlone', [
    fallbackItem('/collections/vlone-t-shirts', 'T-Shirts'),
  ]),
  fallbackItem('/collections/syna-world', 'Syna World', [
    fallbackItem('/collections/syna-world-tracksuits', 'Tracksuits'),
  ]),
  fallbackItem('/collections/hellstar', 'Hellstar'),
  fallbackItem('/collections/gallery-dept', 'Gallery Dept'),
  fallbackItem('/collections/corteiz', 'Corteiz'),
  // Comme des Garçons lives under Sneakers only: all 24 products in that
  // collection are productType "sneakers" (CDG PLAY Converse, CDG Air Force
  // 1, Jordan 1 CDG). Listing it here promised apparel the collection has none of.
  fallbackItem('/collections/represent', 'Represent'),
  // Apparel only (24 Sep 2026): smart collections that exclude product type
  // "sneakers" — the NOCTA sneakers stay under Sneakers → Nike x NOCTA.
  fallbackItem('/collections/nocta', 'NOCTA'),
  fallbackItem('/collections/ami-paris', 'AMI Paris'),
  fallbackItem('/collections/nike-apparel', 'Nike Apparel'),
  // Garment categories across every brand, for shoppers who start with the
  // item rather than the label. Pathless group → renders as a strip under the
  // brand grid rather than as brand tiles.
  fallbackGroup('Shop all', [
    fallbackItem('/collections/t-shirts', 'T-Shirts'),
    fallbackItem('/collections/hoodies-sweatshirts', 'Hoodies'),
    fallbackItem('/collections/sets-tracksuits', 'Tracksuits'),
    fallbackItem('/collections/pants-shorts', 'Pants & Shorts'),
    fallbackItem('/collections/jackets-outerwear', 'Jackets'),
  ]),
]);

/**
 * Sneakers is a BRAND grid, not a column layout: each child is a house, and
 * a house's children are its silhouettes. The desktop mega menu renders level
 * one as logo tiles and drills into level two when a brand is picked, which is
 * the only way ~120 model pages stay navigable.
 *
 * A brand with no children is a plain tile that links straight through.
 */
const SNEAKERS_MENU_ITEM = fallbackItem('/collections/sneakers', 'Sneakers', [
  fallbackItem('/collections/nike', 'Nike', [
    fallbackItem('/collections/nike-dunk', 'Nike Dunk'),
    fallbackItem('/collections/nike-dunk-low', 'Dunk Low'),
    fallbackItem('/collections/nike-dunk-sb', 'SB Dunk'),
    fallbackItem('/collections/nike-air-force-1', 'Air Force 1'),
    fallbackItem('/collections/nike-air-max', 'Air Max'),
    fallbackItem('/collections/nike-air-max-1', 'Air Max 1'),
    fallbackItem('/collections/nike-air-max-plus', 'Air Max Plus (TN)'),
    fallbackItem('/collections/nike-vomero-5', 'Zoom Vomero 5'),
    fallbackItem('/collections/nike-p-6000', 'P-6000'),
    fallbackItem('/collections/nike-shox', 'Shox'),
    fallbackItem('/collections/nike-kobe', 'Kobe'),
    fallbackItem('/collections/nike-lebron', 'LeBron'),
    fallbackItem('/collections/nike-blazer', 'Blazer'),
    fallbackItem('/collections/nike-golf', 'Golf'),
    fallbackItem('/collections/travis-scott-sneakers', 'Nike x Travis Scott'),
    fallbackItem('/collections/nike-off-white', 'Nike x Off-White'),
    fallbackItem('/collections/nike-sacai', 'Nike x sacai'),
    fallbackItem('/collections/nike-nocta', 'Nike x NOCTA'),
    fallbackItem('/collections/nike-supreme', 'Nike x Supreme'),
    fallbackItem('/collections/nike-patta', 'Nike x Patta'),
  ]),
  fallbackItem('/collections/jordan', 'Jordan', [
    fallbackItem('/collections/air-jordan-1', 'Air Jordan 1'),
    fallbackItem('/collections/air-jordan-1-high', 'Jordan 1 High'),
    fallbackItem('/collections/air-jordan-1-mid', 'Jordan 1 Mid'),
    fallbackItem('/collections/air-jordan-1-low', 'Jordan 1 Low'),
    fallbackItem('/collections/air-jordan-3', 'Air Jordan 3'),
    fallbackItem('/collections/air-jordan-4', 'Air Jordan 4'),
    fallbackItem('/collections/air-jordan-5', 'Air Jordan 5'),
    fallbackItem('/collections/air-jordan-6', 'Air Jordan 6'),
    fallbackItem('/collections/air-jordan-11', 'Air Jordan 11'),
    fallbackItem('/collections/jumpman-jack', 'Jumpman Jack'),
  ]),
  fallbackItem('/collections/adidas', 'adidas', [
    fallbackItem('/collections/adidas-samba', 'Samba'),
    fallbackItem('/collections/adidas-gazelle', 'Gazelle'),
    fallbackItem('/collections/adidas-gazelle-indoor', 'Gazelle Indoor'),
    fallbackItem('/collections/adidas-gazelle-bold', 'Gazelle Bold'),
    fallbackItem('/collections/adidas-campus', 'Campus'),
    fallbackItem('/collections/adidas-campus-00s', 'Campus 00s'),
    fallbackItem('/collections/adidas-spezial', 'Handball Spezial'),
    fallbackItem('/collections/adidas-superstar', 'Superstar'),
    fallbackItem('/collections/adidas-xlg', 'XLG'),
    fallbackItem('/collections/adidas-taekwondo', 'Taekwondo'),
    fallbackItem('/collections/adidas-sl-72', 'SL 72'),
    fallbackItem('/collections/collab-wales-bonner', 'adidas x Wales Bonner'),
    fallbackItem('/collections/collab-bad-bunny', 'adidas x Bad Bunny'),
  ]),
  fallbackItem('/collections/new-balance', 'New Balance', [
    fallbackItem('/collections/new-balance-9060', '9060'),
    fallbackItem('/collections/new-balance-1906', '1906'),
    fallbackItem('/collections/new-balance-1906l', '1906L'),
    fallbackItem('/collections/new-balance-2002r', '2002R'),
    fallbackItem('/collections/new-balance-550', '550'),
    fallbackItem('/collections/new-balance-530', '530'),
    fallbackItem('/collections/new-balance-740', '740'),
    fallbackItem('/collections/new-balance-1000', '1000'),
    fallbackItem('/collections/new-balance-204l', '204L'),
    fallbackItem('/collections/new-balance-abzorb', 'ABZORB'),
  ]),
  fallbackItem('/collections/yeezy', 'Yeezy', [
    fallbackItem('/collections/yeezy-350', 'Yeezy 350'),
    fallbackItem('/collections/yeezy-700', 'Yeezy 700'),
    fallbackItem('/collections/yeezy-slide', 'Yeezy Slides'),
  ]),
  fallbackItem('/collections/asics', 'ASICS', [
    fallbackItem('/collections/asics-gel-nyc', 'Gel-NYC'),
    fallbackItem('/collections/asics-gel-kayano', 'Gel-Kayano'),
    fallbackItem('/collections/asics-gel-1130', 'Gel-1130'),
    fallbackItem('/collections/asics-gel-nimbus', 'Gel-Nimbus'),
    fallbackItem('/collections/asics-gt-2160', 'GT-2160'),
  ]),
  fallbackItem('/collections/ugg-boots-slippers', 'UGG', [
    fallbackItem('/collections/ugg-tasman', 'Tasman'),
    fallbackItem('/collections/ugg-tazz', 'Tazz'),
    fallbackItem('/collections/ugg-lowmel', 'Lowmel'),
    fallbackItem('/collections/ugg-golden', 'Golden'),
    fallbackItem('/collections/ugg-jasmine', 'Jasmine'),
    fallbackItem('/collections/ugg-neumel', 'Neumel'),
    fallbackItem('/collections/ugg-bailey', 'Bailey'),
    fallbackItem('/collections/ugg-classic-ultra-mini', 'Classic Ultra Mini'),
    fallbackItem('/collections/ugg-classic-mini', 'Classic Mini'),
    fallbackItem('/collections/ugg-classic-micro', 'Classic Micro'),
    fallbackItem('/collections/ugg-platform', 'Platform'),
  ]),
  fallbackItem('/collections/puma', 'Puma', [
    fallbackItem('/collections/puma-speedcat', 'Speedcat'),
    fallbackItem('/collections/puma-lamelo-ball', 'LaMelo Ball'),
  ]),
  fallbackItem('/collections/salomon', 'Salomon', [
    fallbackItem('/collections/salomon-xt-6', 'XT-6'),
  ]),
  fallbackItem('/collections/vans', 'Vans', [
    fallbackItem('/collections/vans-old-skool', 'Old Skool'),
  ]),
  fallbackItem('/collections/crocs', 'Crocs', [
    fallbackItem('/collections/crocs-classic-clog', 'Classic Clog'),
  ]),
  fallbackItem('/collections/converse', 'Converse', [
    fallbackItem('/collections/converse-chuck-taylor', 'Chuck Taylor'),
  ]),
  fallbackItem('/collections/saucony', 'Saucony', [
    fallbackItem('/collections/saucony-progrid', 'ProGrid'),
  ]),
  fallbackItem('/collections/hoka', 'HOKA', [
    fallbackItem('/collections/hoka-one-one', 'One One'),
  ]),
  fallbackItem('/collections/birkenstock', 'Birkenstock', [
    fallbackItem('/collections/birkenstock-boston', 'Boston'),
  ]),
  // No silhouettes deep enough to split — these link straight through.
  fallbackItem('/collections/on-running', 'On Running'),
  fallbackItem('/collections/timberland', 'Timberland'),
  fallbackItem('/collections/maison-mihara-yasuhiro', 'Maison Mihara Yasuhiro'),
  fallbackItem('/collections/comme-des-garcons', 'Comme des Garçons'),
  fallbackItem('/collections/under-armour', 'Under Armour'),
  // Footwear types across every brand — same strip treatment as Clothing.
  fallbackGroup('Shop all', [
    fallbackItem('/collections/sneakers', 'Sneakers'),
    fallbackItem('/collections/boots', 'Boots'),
    fallbackItem('/collections/slippers', 'Slippers & Slides'),
    fallbackItem('/collections/collabs', 'Collabs'),
  ]),
]);

/** Accessories: bags, laces and caps, which sat buried under Clothing. */
const ACCESSORIES_MENU_ITEM = fallbackItem(
  '/collections/accessories',
  'Accessories',
  [
    // Bags / Women's Bags / Jacquemus were three doors onto near-identical
    // stock. One Bags tile now drills into the labels and shapes beneath it.
    fallbackItem('/collections/bags', 'Bags', [
      fallbackItem('/collections/jacquemus', 'Jacquemus'),
      fallbackItem('/collections/jacquemus-le-grand-bambino', 'Le Grand Bambino'),
      fallbackItem('/collections/jacquemus-le-bambino', 'Le Bambino'),
      fallbackItem('/collections/jacquemus-le-long-bambino', 'Le Long Bambino'),
      fallbackItem('/collections/jacquemus-croco', 'Croco'),
      fallbackItem('/collections/women-bags', "Women's Bags"),
    ]),
    fallbackItem('/collections/shoelaces', 'Shoelaces'),
    fallbackItem('/collections/caps-hats', 'Caps & Hats'),
  ],
);

/**
 * Departments, front to back. Kept deliberately short: two product-type doors
 * (Sneakers, Clothing) carry ~95% of the catalogue between them, and every
 * brand and model now lives inside those rather than competing for a slot in
 * the bar. Men is gone — its rule matched 91% of products, so it narrowed
 * nothing; men's footwear is reachable as Sneakers → Men's Sneakers.
 */
const STOREFRONT_MENU = {
  id: 'storefront-menu',
  items: [
    SNEAKERS_MENU_ITEM,
    CLOTHING_MENU_ITEM,
    ACCESSORIES_MENU_ITEM,
    WOMEN_MENU_ITEM,
    KIDS_MENU_ITEM,
    fallbackItem('/collections/sale', 'Sale'),
  ],
};

/**
 * The normalized menu tree. `children` is optional because the normalizer
 * stops adding it at the deepest level — a leaf link has no key at all.
 */
interface MegaNode {
  id: string;
  title: string;
  path: string | null;
  children?: MegaNode[];
}

/**
 * The desktop mega panel: a grid of brand tiles that drills into one brand's
 * silhouettes, instead of printing every column at once.
 *
 * With ~120 model pages the all-columns layout stopped being a menu and
 * became a wall — Nike alone is 20 rows. Two levels keeps the first view
 * scannable (a logo grid you read at a glance) and puts the depth one click
 * away, which is also how the mobile drawer now works.
 */
function MegaBrandGrid({
  item,
  promoCount,
  localize,
  onNavigate,
}: {
  item: MegaNode;
  promoCount: number;
  localize: (path: string) => string;
  onNavigate: () => void;
}) {
  const t = useTranslate();
  const [openBrandId, setOpenBrandId] = useState<string | null>(null);
  /**
   * The brand the drilled panel is showing. It lags `openBrandId` on the way
   * out: dropping the brand slides the grid back, and the panel sliding away
   * has to keep its rows for the length of that slide rather than emptying
   * mid-flight. Same trick the mobile drawer uses for its subpanels.
   */
  const [renderedBrandId, setRenderedBrandId] = useState<string | null>(null);
  const brands = item.children ?? [];
  const drillable = (id: string | null) =>
    brands.find((child) => child.id === id && canDrill(child)) ?? null;
  const openBrand = drillable(openBrandId);
  if (openBrandId && renderedBrandId !== openBrandId) {
    setRenderedBrandId(openBrandId);
  }
  const renderedBrand = drillable(renderedBrandId);

  const stackRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const drillRef = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState({grid: 0, drill: 0});

  // Leaving the panel resets it, so re-opening never lands on a stale brand.
  useEffect(() => {
    setOpenBrandId(null);
  }, [item.id]);

  /**
   * Measure both panels, always — the drilled one is only visibility:hidden,
   * so it still has a real layout box while the grid is showing.
   *
   * Measurements of 0 are ignored on purpose: the mega panel is display:none
   * whenever the menu is closed, and a display:none element measures 0.
   * Keeping the last real height means the panel opens at its true size
   * instead of unfolding from nothing on every hover.
   */
  useEffect(() => {
    const grid = gridRef.current;
    const drill = drillRef.current;
    if (!grid || !drill) return;
    const update = () => {
      const gridHeight = grid.offsetHeight;
      const drillHeight = drill.offsetHeight;
      setHeights((previous) => ({
        grid: gridHeight > 0 ? gridHeight : previous.grid,
        drill: drillHeight > 0 ? drillHeight : previous.drill,
      }));
    };
    // No direct `update()`: on mount the mega panel is display:none and
    // measures 0 (ignored above), yet asking still forced a layout. The
    // observer reports the real sizes the moment the panel is shown.
    const observer = new ResizeObserver(update);
    observer.observe(grid);
    observer.observe(drill);
    return () => observer.disconnect();
  }, []);

  /**
   * The stack grows to fit the drilled panel but never shrinks below the
   * brand grid.
   *
   * Letting it shrink is what made drilling bounce straight back to the grid:
   * Puma's two rows are far shorter than the wall of logos, so the stack
   * collapsed out from under a pointer that had just clicked a tile in the
   * third row. That fired mouseleave, which reset the drill, which restored
   * the tall grid — a round trip that read as the menu refusing to open.
   * A floor at the grid's height means the box under the pointer only ever
   * gets bigger, so the pointer cannot be orphaned by the panel it just
   * opened.
   */
  const stackHeight = openBrand
    ? Math.max(heights.drill, heights.grid)
    : heights.grid;

  /**
   * Reset the drill when the pointer leaves the whole mega panel, not when it
   * leaves the stack. The stack is the part that changes size; `.header-mega`
   * wraps it in fixed padding alongside the promo card, and leaving that box
   * is also the moment CSS closes the menu — so the two agree instead of
   * fighting.
   */
  useEffect(() => {
    const panel = stackRef.current?.closest('.header-mega');
    if (!panel) return;
    const reset = () => setOpenBrandId(null);
    panel.addEventListener('mouseleave', reset);
    return () => panel.removeEventListener('mouseleave', reset);
  }, []);

  // Following any link closes the panel, so drop the drill at the same time:
  // the shopper's next hover should land on the brand grid, not on the level
  // they happened to leave from.
  const follow = () => {
    setOpenBrandId(null);
    onNavigate();
  };

  // A child with no destination of its own is a shortcut row, not a brand —
  // it renders as a labelled strip under the grid so "All T-Shirts" doesn't
  // sit in the tile wall pretending to be a label.
  const tiles = brands.filter((child) => child.path);
  const shortcuts = brands.filter(
    (child) => !child.path && drillRows(child).length > 0,
  );

  return (
    <div
      ref={stackRef}
      className={`header-mega-stack${openBrand ? ' is-drilled' : ''}`}
      style={stackHeight ? {height: `${stackHeight}px`} : undefined}
    >
      <div className="header-mega-track">
        <div
          className="header-mega-body"
          ref={gridRef}
          aria-hidden={Boolean(openBrand)}
        >
          <div className="header-mega-brands">
            {tiles.map((brand) =>
              canDrill(brand) ? (
                <button
                  key={brand.id}
                  type="button"
                  className="header-mega-brand reset"
                  onClick={() => setOpenBrandId(brand.id)}
                >
                  <BrandFace title={brand.title} path={brand.path} />
                  <span className="menu-chevron" aria-hidden="true">
                    ›
                  </span>
                </button>
              ) : (
                <NavLink
                  key={brand.id}
                  className="header-mega-brand"
                  prefetch="intent"
                  onClick={follow}
                  to={localize(brand.path!)}
                >
                  <BrandFace title={brand.title} path={brand.path} />
                </NavLink>
              ),
            )}
          </div>
          {shortcuts.map((row) => (
            <div className="header-mega-shortcuts" key={row.id}>
              <span className="header-mega-shortcuts-label">
                {t(row.title)}
              </span>
              <div className="header-mega-shortcuts-links">
                {(row.children ?? []).map((link) => (
                  <NavLink
                    key={link.id}
                    className="header-mega-shortcut"
                    prefetch="intent"
                    onClick={follow}
                    to={localize(link.path!)}
                  >
                    {t(link.title)}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div
          className="header-mega-drill"
          ref={drillRef}
          data-promo={promoCount > 0 ? 'yes' : 'no'}
          aria-hidden={!openBrand}
        >
          {renderedBrand ? (
            <>
              <button
                type="button"
                className="header-mega-back reset"
                onClick={() => setOpenBrandId(null)}
              >
                <span className="menu-chevron" aria-hidden="true">
                  ‹
                </span>
                <span>{renderedBrand.title}</span>
              </button>
              <div className="header-mega-drill-links">
                {renderedBrand.path ? (
                  <NavLink
                    className="header-mega-drill-link"
                    prefetch="intent"
                    onClick={follow}
                    to={localize(renderedBrand.path)}
                  >
                    <TileThumb path={renderedBrand.path} />
                    <span>
                      {t('View all')} {renderedBrand.title}
                    </span>
                  </NavLink>
                ) : null}
                {drillRows(renderedBrand).map((link) => (
                  <NavLink
                    key={link.id}
                    className="header-mega-drill-link"
                    prefetch="intent"
                    onClick={follow}
                    to={localize(link.path!)}
                  >
                    <TileThumb path={link.path} />
                    <span>{t(link.title)}</span>
                  </NavLink>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * A brand tile's face: the wordmark when we hold one, otherwise the brand
 * name set in type. Never a product photo — a logo grid reads as brands, a
 * photo grid reads as products.
 */
function BrandFace({title, path}: {title: string; path?: string | null}) {
  const logo = brandLogoFor(path);
  return logo ? (
    <img className="header-mega-logo" src={logo} alt={title} loading="lazy" />
  ) : (
    <span className="header-mega-brandname">{title}</span>
  );
}

function activeLinkStyle({
  isActive,
  isPending,
}: {
  isActive: boolean;
  isPending: boolean;
}) {
  return {
    fontWeight: isActive ? 600 : undefined,
    color: isPending ? 'var(--color-muted)' : undefined,
  };
}
