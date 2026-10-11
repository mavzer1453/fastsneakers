import {useEffect, useRef, useState} from 'react';
import {useFetcher, useLocation, useNavigate} from 'react-router';
import {CartForm, type I18nBase} from '@shopify/hydrogen';
import {
  CURRENCIES,
  DEFAULT_LOCALE,
  LANGUAGES,
  SUPPORTED_LOCALES,
  getCurrency,
  type Locale,
} from '~/lib/i18n';
import {useLocalePrefix} from '~/lib/localizedLink';
import {useTranslate} from '~/lib/useTranslate';

/**
 * Language and currency behind a single control.
 *
 * Two separate pills cost two slots in a header row that only has about
 * five, and on a phone that was enough to push the whole icon group onto a
 * second line under the wordmark. Folding them into one button buys the
 * slot back.
 *
 * They stay two distinct *choices* inside the panel, though — collapsed
 * into their own accordions, each showing its current value. A shopper who
 * opens this wants one or the other, not a scroll through seven languages
 * to reach twenty-two currencies.
 */
export function LocaleMenu({
  selectedLocale,
  variant = 'flag',
}: {
  selectedLocale?: Pick<I18nBase, 'country' | 'language'>;
  /**
   * `flag` = the active language's flag alone (header).
   * `pill` = flag + currency symbol in a bordered pill (mobile drawer),
   * where there is room to say what the control holds.
   */
  variant?: 'flag' | 'pill';
}) {
  const t = useTranslate();
  const {pathname, search} = useLocation();

  // Both sections start collapsed (owner request, 24 Sep 2026): the panel
  // opens as a summary — current language and currency — and the shopper
  // picks which one to change. Only one list can be open at a time, and
  // closing the panel collapses them again (see Dropdown's onClose).
  const [openSection, setOpenSection] = useState<
    'language' | 'currency' | null
  >(null);

  const current =
    SUPPORTED_LOCALES.find(
      (locale) =>
        locale.country === selectedLocale?.country &&
        locale.language === selectedLocale?.language,
    ) ?? DEFAULT_LOCALE;

  const currentCurrency = getCurrency(current.currency);
  const currentLanguage =
    LANGUAGES.find((language) => language.code === current.language) ??
    LANGUAGES[0];

  const strippedPathname = stripLocalePrefix(pathname);
  const redirectFor = (locale: Locale) =>
    (locale.pathPrefix || '') +
      (strippedPathname === '/' && locale.pathPrefix ? '' : strippedPathname) +
      search || '/';

  // Each axis holds the other steady — changing what you read in should not
  // silently change what you pay in, or a shopper thinks the site lost their
  // settings.
  const localeForLanguage = (language: string) =>
    SUPPORTED_LOCALES.find(
      (locale) =>
        locale.language === language && locale.currency === current.currency,
    ) ?? DEFAULT_LOCALE;

  const localeForCurrency = (currency: string) =>
    SUPPORTED_LOCALES.find(
      (locale) =>
        locale.language === current.language && locale.currency === currency,
    ) ?? DEFAULT_LOCALE;

  return (
    <div className={`locale-menu is-${variant}`}>
      <Dropdown
        summary={
          variant === 'pill' ? (
            <span className="country-selector-bowl has-code" aria-hidden="true">
              <span className="country-selector-flag-emoji">
                {currentLanguage.flag}
              </span>
              <span className="country-selector-lang-code">
                {currentCurrency.symbol}
              </span>
            </span>
          ) : (
            <span className="country-selector-bowl" aria-hidden="true">
              {currentLanguage.flag}
            </span>
          )
        }
        summaryLabel={`${t('Language & Currency')}: ${currentLanguage.label}, ${
          currentCurrency.label
        }`}
        showCaret={false}
        onClose={() => setOpenSection(null)}
      >
        <LocaleSection
          label={t('Language')}
          value={`${currentLanguage.flag} ${currentLanguage.label}`}
          open={openSection === 'language'}
          onOpen={() =>
            setOpenSection((current) =>
              current === 'language' ? null : 'language',
            )
          }
        >
          {LANGUAGES.map((language) => {
            const target = localeForLanguage(language.code);
            return (
              <LocaleItem
                key={language.code}
                locale={target}
                redirectTo={redirectFor(target)}
                isActive={language.code === current.language}
              >
                <span className="country-selector-flag" aria-hidden="true">
                  {language.flag}
                </span>
                <span>{language.label}</span>
              </LocaleItem>
            );
          })}
        </LocaleSection>

        <LocaleSection
          label={t('Currency')}
          value={`${currentCurrency.symbol} ${currentCurrency.code}`}
          open={openSection === 'currency'}
          onOpen={() =>
            setOpenSection((current) =>
              current === 'currency' ? null : 'currency',
            )
          }
        >
          {CURRENCIES.map((currency) => {
            const target = localeForCurrency(currency.code);
            return (
              <LocaleItem
                key={currency.code}
                locale={target}
                redirectTo={redirectFor(target)}
                isActive={currency.code === current.currency}
              >
                <span className="country-selector-flag" aria-hidden="true">
                  {currency.flag}
                </span>
                <span>
                  {currency.code} — {currency.label}
                </span>
              </LocaleItem>
            );
          })}
        </LocaleSection>
      </Dropdown>
    </div>
  );
}

/**
 * One axis inside the panel. Each row always shows its current value, so
 * the panel answers "what am I set to?" without anyone expanding anything.
 *
 * Controlled rather than a `<details>`: the two rows are an accordion, and
 * only one can be open. Two open lists — seven languages above twenty-two
 * currencies — pushed the second row off the bottom of the sheet, so the
 * other choice stopped existing as far as the shopper could tell.
 */
function LocaleSection({
  label,
  value,
  open,
  onOpen,
  children,
}: {
  label: string;
  value: string;
  open: boolean;
  onOpen: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`locale-section${open ? ' is-open' : ''}`}>
      {/* Deliberately NOT `.reset`: that helper carries
          `button.reset > * { margin: 0 }`, which outranks the
          `margin-left: auto` that pushes the value out to the right edge.
          This button normalises itself in CSS instead. */}
      <button
        type="button"
        className="locale-section-summary"
        aria-expanded={open}
        onClick={onOpen}
      >
        <span className="locale-section-label">{label}</span>
        <span className="locale-section-value">{value}</span>
        <span className="locale-section-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? <div className="locale-section-list">{children}</div> : null}
    </div>
  );
}

/** `<details>` dropdown that closes when clicking/tapping outside it. */
function Dropdown({
  summary,
  summaryLabel,
  showCaret = true,
  onClose,
  children,
}: {
  summary: React.ReactNode;
  summaryLabel: string;
  showCaret?: boolean;
  /** Called whenever the panel closes, however it was closed. */
  onClose?: () => void;
  children: React.ReactNode;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const details = detailsRef.current;
      if (
        details?.open &&
        event.target instanceof Node &&
        !details.contains(event.target)
      ) {
        details.open = false;
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () =>
      document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  return (
    <details
      className="country-selector-details"
      ref={detailsRef}
      onToggle={(event) => {
        if (!(event.currentTarget as HTMLDetailsElement).open) {
          onClose?.();
          return;
        }
        // Inside the scrollable mobile menu the expanded list can open
        // below the fold — pull it into view so it is always tappable.
        requestAnimationFrame(() => {
          detailsRef.current
            ?.querySelector('.country-selector-list')
            ?.scrollIntoView({block: 'nearest', behavior: 'smooth'});
        });
      }}
    >
      <summary className="country-selector-summary" aria-label={summaryLabel}>
        {summary}
        {showCaret ? (
          <span className="country-selector-caret" aria-hidden="true">
            ▾
          </span>
        ) : null}
      </summary>
      <div className="country-selector-list">{children}</div>
    </details>
  );
}

function LocaleItem({
  locale,
  redirectTo,
  isActive,
  children,
}: {
  locale: Locale;
  redirectTo: string;
  isActive: boolean;
  children: React.ReactNode;
}) {
  const cartRoute = useLocalePrefix() + '/cart';
  const fetcher = useFetcher();
  const navigate = useNavigate();

  return (
    <button
      type="button"
      className={`country-selector-item${isActive ? ' active' : ''}`}
      onClick={(event) => {
        // Collapse the menu the choice was made in. Closing the outermost
        // `<details>` (the panel) also collapses the section inside it, so
        // reopening starts from a clean state rather than mid-scroll
        // through twenty-two currencies.
        const panel = event.currentTarget.closest('details.country-selector-details');
        if (panel instanceof HTMLDetailsElement) panel.open = false;

        // The new page's language and prices come from the URL prefix, not
        // from the cart — so the buyer-identity update (needed later, at
        // checkout, for the right currency) doesn't have to finish before
        // the page swap starts. Chaining them ("update → redirect → load")
        // is what made switching take a couple of seconds; firing both at
        // once lets the two network calls overlap instead of queuing.
        // `void`: both are deliberately un-awaited so they overlap.
        void fetcher.submit(
          {
            [CartForm.INPUT_NAME]: JSON.stringify({
              action: CartForm.ACTIONS.BuyerIdentityUpdate,
              inputs: {buyerIdentity: {countryCode: locale.country}},
            }),
          },
          {method: 'post', action: cartRoute},
        );
        void navigate(redirectTo);
      }}
    >
      {children}
    </button>
  );
}

/** Remove a leading `/xx-yy` market prefix from a pathname. */
function stripLocalePrefix(pathname: string): string {
  const match = SUPPORTED_LOCALES.find(
    (locale) =>
      locale.pathPrefix &&
      (pathname === locale.pathPrefix ||
        pathname.startsWith(locale.pathPrefix + '/')),
  );
  if (!match) return pathname;
  const stripped = pathname.slice(match.pathPrefix.length);
  return stripped || '/';
}
