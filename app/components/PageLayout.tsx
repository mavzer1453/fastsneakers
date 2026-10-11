import {Await, NavLink, useAsyncValue, useFetcher} from 'react-router';
import {useOptimisticCart} from '@shopify/hydrogen';
import {Suspense, useEffect, useRef} from 'react';
import type {
  CartApiQueryFragment,
  HeaderQuery,
} from 'storefrontapi.generated';
import {Aside, useAside} from '~/components/Aside';
import {
  LocaleMenu,
} from '~/components/CountrySelector';
import {Footer} from '~/components/Footer';
import {Header, HeaderMenu} from '~/components/Header';
import {CartMain} from '~/components/CartMain';
import {
  AddedToCartToast,
  AddedToCartProvider,
} from '~/components/AddedToCart';
import {LiveActivity} from '~/components/LiveActivity';
import type {LiveActivityItem} from '~/lib/liveActivity';
import {useLocalizedHref} from '~/lib/localizedLink';
import {useGuestWishlist, useIsLoggedIn} from '~/lib/wishlist';
import {removeGuestFavorite} from '~/lib/guestWishlist';
import {BRAND_LOCKUP} from '~/data/shop';
import {useTranslate} from '~/lib/useTranslate';
import {whenVisitorEngages} from '~/lib/pixels';
import type {I18nBase} from '@shopify/hydrogen';

const ACCOUNT_COMPONENT_URL =
  'https://cdn.shopify.com/storefront/web-components/account.js';

/**
 * Load Shopify's <shopify-account> web component — late.
 *
 * It is what lets a customer sign in inside the storefront instead of being
 * handed to Shopify's hosted login page and stranded there, so it has to be
 * on every page. But nobody signs in during the first two seconds, and the
 * script drags ~60 further modules in behind it, so it waits for the page to
 * finish loading. Until then the header shows the same icon (it is our own
 * slotted markup); the component upgrades it in place when it arrives.
 *
 * A tap or key press anywhere loads it immediately, so someone who goes
 * straight for the account icon is not left waiting on an idle callback.
 */
function useAccountComponent(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    if (window.customElements?.get('shopify-account')) return;
    let injected = false;
    const inject = () => {
      if (injected) return;
      injected = true;
      window.removeEventListener('pointerdown', inject);
      window.removeEventListener('keydown', inject);
      if (document.querySelector(`script[src="${ACCOUNT_COMPONENT_URL}"]`)) {
        return;
      }
      const script = document.createElement('script');
      script.type = 'module';
      script.crossOrigin = 'anonymous';
      script.src = ACCOUNT_COMPONENT_URL;
      // <head> is outside the hydrated tree, so this cannot disturb React.
      document.head.appendChild(script);
    };
    window.addEventListener('pointerdown', inject, {passive: true});
    window.addEventListener('keydown', inject);
    // Otherwise with the pixels: first scroll/touch after load, or a long cap.
    whenVisitorEngages(inject);
    return () => {
      window.removeEventListener('pointerdown', inject);
      window.removeEventListener('keydown', inject);
    };
  }, [enabled]);
}

interface PageLayoutProps {
  cart: Promise<CartApiQueryFragment | null>;
  header: HeaderQuery;
  isLoggedIn: Promise<boolean>;
  publicStoreDomain: string;
  /** Storefront API token the <shopify-account> component authenticates with. */
  publicAccessToken?: string;
  /** Present only while a customer is signed in. */
  customerAccessToken?: string | null;
  selectedLocale?: I18nBase;
  /** Real recent-order / bestseller feed behind the live-activity popup. */
  liveActivity?: Promise<LiveActivityItem[]>;
  children?: React.ReactNode;
}

export function PageLayout({
  cart,
  children = null,
  header,
  isLoggedIn,
  publicStoreDomain,
  publicAccessToken,
  customerAccessToken,
  selectedLocale,
  liveActivity,
}: PageLayoutProps) {
  useAccountComponent(Boolean(publicAccessToken));
  return (
    <Aside.Provider>
      <AddedToCartProvider>
        {/* Store context for every <shopify-account> on the page. Shopify's
            reference renders this as a sibling of the components that read
            it, not a wrapper, so one instance up here serves both the header
            icon and the row in the mobile drawer. It paints nothing. */}
        {publicAccessToken ? (
          <shopify-store
            store-domain={`https://${publicStoreDomain}`}
            public-access-token={publicAccessToken}
            customer-access-token={customerAccessToken ?? undefined}
          />
        ) : null}
        <CartAside cart={cart} />
        <MobileMenuAside
          header={header}
          publicStoreDomain={publicStoreDomain}
          selectedLocale={selectedLocale}
          hasStoreContext={Boolean(publicAccessToken)}
        />
        {header && (
          <Header
            header={header}
            cart={cart}
            isLoggedIn={isLoggedIn}
            publicStoreDomain={publicStoreDomain}
            publicAccessToken={publicAccessToken}
            selectedLocale={selectedLocale}
          />
        )}
        <main>{children}</main>
        <Footer selectedLocale={selectedLocale} />
        <AddedToCartToast />
        <LiveActivity items={liveActivity} />
        <FavoritesAccountSync />
      </AddedToCartProvider>
    </Aside.Provider>
  );
}

/**
 * After sign-in, silently merges any on-device favorites into the customer
 * account wishlist, then clears them locally. One attempt per page load;
 * failures (e.g. wishlist metafield not configured) stay silent — favorites
 * keep working on-device either way.
 */
function FavoritesAccountSync() {
  const loggedIn = useIsLoggedIn();
  const guestIds = useGuestWishlist();
  const fetcher = useFetcher<{ok: boolean; synced?: string[]}>();
  const localize = useLocalizedHref();
  const attempted = useRef(false);

  const idsKey = guestIds.join(',');
  const favoritesHref = localize('/favorites');

  useEffect(() => {
    if (loggedIn !== true || !idsKey || attempted.current) return;
    attempted.current = true;
    void fetcher.submit(
      {intent: 'sync', ids: idsKey},
      {method: 'post', action: favoritesHref},
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, idsKey, favoritesHref]);

  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data?.ok) return;
    for (const id of fetcher.data.synced ?? []) {
      removeGuestFavorite(id);
    }
  }, [fetcher.state, fetcher.data]);

  return null;
}

/**
 * "Your cart (3)" — the count comes from the same optimistic cart the header
 * badge uses, so adding a line updates the heading before the server answers.
 * It resolves the cart promise a second time, which costs nothing: `Await`
 * reads the promise React already has in flight.
 */
function CartHeadingCount() {
  const cart = useOptimisticCart(useAsyncValue() as CartApiQueryFragment | null);
  const count = cart?.totalQuantity ?? 0;
  return count > 0 ? <span className="cart-heading-count">({count})</span> : null;
}

function CartAsideHeading({cart}: {cart: PageLayoutProps['cart']}) {
  return (
    <span className="cart-heading">
      Your cart
      <Suspense fallback={null}>
        <Await resolve={cart} errorElement={null}>
          <CartHeadingCount />
        </Await>
      </Suspense>
    </span>
  );
}

function CartAside({cart}: {cart: PageLayoutProps['cart']}) {
  return (
    <Aside type="cart" heading={<CartAsideHeading cart={cart} />}>
      <Suspense fallback={<p>Loading cart ...</p>}>
        <Await
          resolve={cart}
          errorElement={<CartMain cart={null} layout="aside" />}
        >
          {(cart) => {
            return <CartMain cart={cart} layout="aside" />;
          }}
        </Await>
      </Suspense>
    </Aside>
  );
}

function MobileMenuBrand() {
  return (
    <span className="mobile-menu-brand">
      <img src="/fastsneakers-logo.png" alt="" />
      <span className="header-brand-name">
        <span className="header-brand-top">{BRAND_LOCKUP.top}</span>
        <span className="header-brand-sub">{BRAND_LOCKUP.sub}</span>
      </span>
    </span>
  );
}

function MobileMenuAside({
  header,
  publicStoreDomain,
  selectedLocale,
  hasStoreContext,
}: {
  header: PageLayoutProps['header'];
  publicStoreDomain: PageLayoutProps['publicStoreDomain'];
  selectedLocale?: PageLayoutProps['selectedLocale'];
  hasStoreContext: boolean;
}) {
  return (
    <Aside
      type="mobile"
      heading={
        <>
          <MobileMenuBrand />
          {/* HeaderMenu portals its "‹ Sneakers" back control in here while a
              panel is drilled; CSS hides the brand for as long as it is
              filled (see .mobile-menu-crumb in app.css). */}
          <span id="mobile-menu-crumb" className="mobile-menu-crumb" />
        </>
      }
    >
      <MobileMenuContent
        header={header}
        publicStoreDomain={publicStoreDomain}
        selectedLocale={selectedLocale}
        hasStoreContext={hasStoreContext}
      />
    </Aside>
  );
}

function MobileMenuContent({
  header,
  publicStoreDomain,
  selectedLocale,
  hasStoreContext,
}: {
  header: PageLayoutProps['header'];
  publicStoreDomain: PageLayoutProps['publicStoreDomain'];
  selectedLocale?: PageLayoutProps['selectedLocale'];
  hasStoreContext: boolean;
}) {
  const localize = useLocalizedHref();
  const {close} = useAside();
  const loggedIn = useIsLoggedIn();
  const t = useTranslate();

  return (
    <nav className="mobile-menu" aria-label="Mobile menu">
      <HeaderMenu
        viewport="mobile"
        primaryDomainUrl={header?.shop?.primaryDomain?.url ?? ''}
        publicStoreDomain={publicStoreDomain}
      />

      <hr className="mobile-menu-sep" />

      {/* On phones this is the only way into an account — the header icon is
          hidden at this width. It has to open the same in-page sheet, or
          everyone on mobile still lands on Shopify's hosted login page.
          Signed-in customers keep the plain link, since the destination is
          their account, not a sign-in prompt. */}
      {loggedIn || !hasStoreContext ? (
        <NavLink
          className="mobile-menu-row mobile-menu-row-rich"
          to={localize(loggedIn ? '/account' : '/account/login')}
          onClick={close}
          prefetch="intent"
        >
          <span className="mobile-menu-row-main">
            <MenuGlyph type="account" />
            <span>{loggedIn ? t('My account') : t('Sign in')}</span>
          </span>
          <span className="menu-chevron" aria-hidden="true">
            ›
          </span>
        </NavLink>
      ) : (
        <shopify-account
          menu="customer-account-main-menu"
          sign-in-url="/account/login"
        >
          {/* Not interactive: Shopify wraps the slot in its own button, so a
              link here would swallow the click and navigate away. */}
          <span
            slot="signed-out-avatar"
            className="mobile-menu-row mobile-menu-row-rich"
          >
            <span className="mobile-menu-row-main">
              <MenuGlyph type="account" />
              <span>{t('Sign in')}</span>
            </span>
            <span className="menu-chevron" aria-hidden="true">
              ›
            </span>
          </span>
        </shopify-account>
      )}

      {/* Help is collapsed by default — three rows of support links are not
          what most people open the menu for. */}
      <details className="mobile-menu-details">
        <summary className="mobile-menu-row mobile-menu-row-rich">
          <span className="mobile-menu-row-main">
            <MenuGlyph type="faq" />
            <span>{t('Help & service')}</span>
          </span>
          <span className="menu-chevron" aria-hidden="true">
            ›
          </span>
        </summary>
        <div className="mobile-menu-group">
          {SERVICE_LINKS.map((link) => (
            <NavLink
              key={link.label}
              className="mobile-menu-row"
              to={localize(link.to)}
              onClick={close}
              prefetch="intent"
            >
              {t(link.label)}
            </NavLink>
          ))}
        </div>
      </details>

      {/* Trails the drawer: language and currency are settings, not
          destinations. Compact flag + symbol pills, matching the header. */}
      <hr className="mobile-menu-sep" />
      <div className="mobile-menu-locale mobile-menu-locale-end">
        <span className="mobile-menu-locale-label">
          {t('Language & Currency')}
        </span>
        <div className="mobile-menu-locale-row">
          <LocaleMenu selectedLocale={selectedLocale} variant="pill" />
        </div>
      </div>
    </nav>
  );
}

const SERVICE_LINKS: Array<{label: string; to: string}> = [
  {label: 'FAQ', to: '/pages/faq'},
  {label: 'Contact', to: '/pages/contact'},
  {label: 'Track order', to: '/pages/track-order'},
  {label: 'Shipping & returns', to: '/pages/shipping'},
  {label: 'Size guide', to: '/pages/size-guide'},
];

function MenuGlyph({type}: {type: 'account' | 'faq' | 'mail' | 'box'}) {
  const paths: Record<string, React.ReactNode> = {
    account: (
      <>
        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
        <path
          d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </>
    ),
    faq: (
      <>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path
          d="M9.5 9.5a2.5 2.5 0 1 1 3.7 2.2c-.8.45-1.2 1-1.2 1.8"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="12" cy="16.6" r="1.1" fill="currentColor" />
      </>
    ),
    mail: (
      <>
        <rect
          x="3"
          y="5"
          width="18"
          height="14"
          rx="2"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="m4 7 8 6 8-6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
    box: (
      <>
        <path
          d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M3 7.5 12 12l9-4.5M12 12v9"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </>
    ),
  };
  return (
    <span className="mobile-menu-glyph" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        {paths[type]}
      </svg>
    </span>
  );
}
