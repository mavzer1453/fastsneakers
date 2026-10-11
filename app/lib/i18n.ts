import type {I18nBase} from '@shopify/hydrogen';

export interface I18nLocale extends I18nBase {
  pathPrefix: string;
}

/**
 * A single storefront locale. Shopify localizes prices, currency and
 * translated content whenever we pass `country` + `language` to the
 * Storefront API via the `@inContext` directive.
 *
 * `currency` and `label` are only used for the UI (the country selector);
 * the actual currency shown on products always comes from Shopify based on
 * the `country` code.
 */
export interface Locale {
  label: string;
  /** Flag emoji of the language, shown in the selector. */
  flag: string;
  language: I18nLocale['language'];
  country: I18nLocale['country'];
  currency: string;
  /** URL prefix, e.g. `/de-de`. Empty string for the default locale. */
  pathPrefix: string;
}

/**
 * Language and currency are selected independently in the UI. The Storefront
 * API prices by COUNTRY, so each currency maps to a representative country;
 * a language + currency pair resolves to one locale (URL prefix
 * `/{language}-{country}`). Default: English + EUR at the un-prefixed root.
 */
export interface LanguageOption {
  code: I18nLocale['language'];
  label: string;
  flag: string;
}

export interface CurrencyOption {
  code: string;
  label: string;
  symbol: string;
  /** Representative country that Shopify prices this currency through. */
  country: I18nLocale['country'];
  flag: string;
}

/**
 * Each language is named in itself, never in English: a Turkish shopper looks
 * for "Türkçe", not "Turkish".
 *
 * These codes have to match the locales published in Shopify admin, because
 * the same value is sent to the Storefront API as `@inContext(language:)` —
 * an unpublished locale silently returns English.
 */
export const LANGUAGES: LanguageOption[] = [
  {code: 'EN', label: 'English', flag: '🇬🇧'},
  {code: 'DE', label: 'Deutsch', flag: '🇩🇪'},
  {code: 'FR', label: 'Français', flag: '🇫🇷'},
  {code: 'ES', label: 'Español', flag: '🇪🇸'},
  {code: 'IT', label: 'Italiano', flag: '🇮🇹'},
  {code: 'SV', label: 'Svenska', flag: '🇸🇪'},
  {code: 'TR', label: 'Türkçe', flag: '🇹🇷'},
];

/**
 * One entry per currency of the countries in the store's shipping zones.
 * Note: prices only actually convert for countries enabled in Shopify
 * Admin → Settings → Markets; others fall back to the store currency.
 *
 * Removed 24 Sep 2026 because Shopify charged EUR for them (the selector
 * said one currency, the product page and checkout another): NOK (Norway's
 * market is on EUR — enable NOK there, then add it back), BGN (Bulgaria is
 * on the euro since 1 Jan 2026) and BYN. Old /xx-no, /xx-bg, /xx-by URLs 301
 * to the same language's euro store via the ($locale) route guard.
 */
export const CURRENCIES: CurrencyOption[] = [
  {code: 'EUR', label: 'Euro', symbol: '€', country: 'NL', flag: '🇪🇺'},
  {code: 'USD', label: 'US Dollar', symbol: '$', country: 'US', flag: '🇺🇸'},
  {code: 'CAD', label: 'Canadian Dollar', symbol: '$', country: 'CA', flag: '🇨🇦'},
  {code: 'GBP', label: 'British Pound', symbol: '£', country: 'GB', flag: '🇬🇧'},
  {code: 'CHF', label: 'Swiss Franc', symbol: 'CHF', country: 'CH', flag: '🇨🇭'},
  {code: 'DKK', label: 'Danish Krone', symbol: 'kr', country: 'DK', flag: '🇩🇰'},
  {code: 'SEK', label: 'Swedish Krona', symbol: 'kr', country: 'SE', flag: '🇸🇪'},
  {code: 'PLN', label: 'Polish Złoty', symbol: 'zł', country: 'PL', flag: '🇵🇱'},
  {code: 'CZK', label: 'Czech Koruna', symbol: 'Kč', country: 'CZ', flag: '🇨🇿'},
  {code: 'HUF', label: 'Hungarian Forint', symbol: 'Ft', country: 'HU', flag: '🇭🇺'},
  {code: 'RON', label: 'Romanian Leu', symbol: 'lei', country: 'RO', flag: '🇷🇴'},
  {code: 'ISK', label: 'Icelandic Króna', symbol: 'kr', country: 'IS', flag: '🇮🇸'},
  {code: 'RSD', label: 'Serbian Dinar', symbol: 'дин', country: 'RS', flag: '🇷🇸'},
  {code: 'BAM', label: 'Bosnian Mark', symbol: 'KM', country: 'BA', flag: '🇧🇦'},
  {code: 'MKD', label: 'Macedonian Denar', symbol: 'ден', country: 'MK', flag: '🇲🇰'},
  {code: 'ALL', label: 'Albanian Lek', symbol: 'L', country: 'AL', flag: '🇦🇱'},
  {code: 'MDL', label: 'Moldovan Leu', symbol: 'L', country: 'MD', flag: '🇲🇩'},
  {code: 'TRY', label: 'Turkish Lira', symbol: '₺', country: 'TR', flag: '🇹🇷'},
  {code: 'AUD', label: 'Australian Dollar', symbol: '$', country: 'AU', flag: '🇦🇺'},
  {code: 'NZD', label: 'New Zealand Dollar', symbol: '$', country: 'NZ', flag: '🇳🇿'},
];

/**
 * For EUR, prefer the language's own euro country so the common URLs stay
 * natural (`/nl-nl`, `/de-de`, `/fr-fr`, `/it-it`) instead of e.g. `/de-nl`.
 */
const EUR_COUNTRY_BY_LANGUAGE: Partial<
  Record<I18nLocale['language'], I18nLocale['country']>
> = {
  EN: 'NL',
  DE: 'DE',
  FR: 'FR',
  ES: 'ES',
  IT: 'IT',
  // Swedish and Turkish are deliberately ABSENT, so their euro locale falls
  // back to NL (/sv-nl, /tr-nl).
  //
  // Pinning them to their own country looked tidier — /sv-se, /tr-tr — but
  // SEK and TRY resolve to those same countries, so both language+currency
  // pairs generated the SAME URL prefix. `getLocaleFromRequest` takes the
  // first match and EUR is first in CURRENCIES, so the krona and lira
  // options were unreachable: picking SEK navigated to /sv-se and landed
  // back on euros. Anything mapped here needs a currency that resolves
  // somewhere else, which is why EN→NL is safe and SV→SE was not.
};

/** Every language × currency combination the storefront supports. */
export const SUPPORTED_LOCALES: Locale[] = LANGUAGES.flatMap((lang) =>
  CURRENCIES.map((currency) => {
    const country =
      currency.code === 'EUR'
        ? (EUR_COUNTRY_BY_LANGUAGE[lang.code] ?? currency.country)
        : currency.country;
    const isDefault = lang.code === 'EN' && currency.code === 'EUR';
    return {
      label: `${lang.label} · ${currency.code}`,
      flag: lang.flag,
      language: lang.code,
      country,
      currency: currency.code,
      pathPrefix: isDefault
        ? ''
        : `/${lang.code.toLowerCase()}-${country.toLowerCase()}`,
    };
  }),
);

/** English + EUR at the un-prefixed root. */
export const DEFAULT_LOCALE: Locale = SUPPORTED_LOCALES.find(
  (locale) => locale.pathPrefix === '',
)!;

export function getCurrency(code: string): CurrencyOption {
  return (
    CURRENCIES.find((currency) => currency.code === code) ?? CURRENCIES[0]
  );
}

/**
 * First-visit geolocation defaults: which currency a visitor's country
 * should see, and which of our languages (if any) matches how they read.
 *
 * Every country here maps to one of the currencies in `CURRENCIES` — this
 * never invents a currency we don't already support. Countries not listed
 * simply get no redirect and land on the default English/EUR store, exactly
 * as if this table didn't exist for them.
 *
 * Language defaults to English unless overridden below — a currency match
 * with no language match (e.g. Albania: ALL is supported, Albanian isn't)
 * is exactly the case that should fall back to English, not fail entirely.
 */
const EUROZONE_COUNTRIES = [
  'DE', 'FR', 'ES', 'IT', 'AT', 'BE', 'NL', 'PT', 'IE', 'GR', 'FI',
  'LU', 'MT', 'CY', 'SK', 'SI', 'EE', 'LV', 'LT', 'HR',
  // Non-EU territories that use the euro unilaterally or by agreement.
  'AD', 'MC', 'SM', 'VA', 'ME', 'XK',
  // Bulgaria joined the euro on 1 Jan 2026.
  'BG',
  // Not euro countries, but Shopify Markets prices them in EUR (their own
  // currency is not enabled — checked 24 Sep 2026). Showing NOK/BYN here
  // would promise a currency the checkout never charges.
  'NO', 'BY',
] as const;

const SINGLE_CURRENCY_COUNTRIES: Record<string, string> = {
  US: 'USD', GB: 'GBP', CH: 'CHF', DK: 'DKK', SE: 'SEK',
  PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', IS: 'ISK',
  RS: 'RSD', BA: 'BAM', MK: 'MKD', AL: 'ALL', MD: 'MDL',
  CA: 'CAD', AU: 'AUD', NZ: 'NZD',
  TR: 'TRY',
};

/** Countries whose language should override the English default. */
const COUNTRY_LANGUAGE_OVERRIDES: Record<string, LanguageOption['code']> = {
  DE: 'DE', AT: 'DE', CH: 'DE',
  FR: 'FR',
  ES: 'ES',
  IT: 'IT',
  SE: 'SV',
  TR: 'TR',
};

/**
 * Resolves a visitor's ISO country code (from Oxygen's `oxygen-buyer-country`
 * header) to one of our supported locales, or `null` if the country isn't
 * one we have a currency for — callers should treat `null` as "no opinion,
 * leave them on the default locale."
 */
export function resolveLocaleForCountry(
  countryCode: string | null | undefined,
): Locale | null {
  if (!countryCode) return null;
  const country = countryCode.toUpperCase();

  const currency = EUROZONE_COUNTRIES.includes(
    country as (typeof EUROZONE_COUNTRIES)[number],
  )
    ? 'EUR'
    : SINGLE_CURRENCY_COUNTRIES[country];
  if (!currency) return null;

  const language = COUNTRY_LANGUAGE_OVERRIDES[country] ?? 'EN';

  return (
    SUPPORTED_LOCALES.find(
      (locale) => locale.language === language && locale.currency === currency,
    ) ?? null
  );
}


/**
 * Prefixes an internal path with the active market prefix, for server-side
 * redirects in loaders/actions. Mirrors `useLocalizedHref()` on the client.
 *
 * Usage: `redirect(localizePath('/account/orders', context.storefront.i18n))`
 */
export function localizePath(
  path: string,
  i18n: I18nBase | I18nLocale,
): string {
  const prefix = ('pathPrefix' in i18n ? i18n.pathPrefix : '') ?? '';
  if (!path.startsWith('/')) return path;
  if (prefix && (path === prefix || path.startsWith(prefix + '/'))) {
    return path;
  }
  return prefix + path;
}

/**
 * Detect the active locale from the request URL.
 * The first path segment (e.g. `/de-de/products/...`) selects the market.
 * Falls back to the default locale (US / USD) when no valid prefix is present.
 */
export function getLocaleFromRequest(request: Request): I18nLocale {
  return getLocaleFromPathname(new URL(request.url).pathname);
}

/**
 * The same lookup from a bare pathname. The browser uses it before hydration
 * (entry.client) to know which language file to fetch, so it MUST resolve
 * exactly as the server did — hence one implementation, not two.
 */
export function getLocaleFromPathname(rawPathname: string): I18nLocale {
  // React Router's single-fetch appends a `.data` suffix to the pathname on
  // client-side navigations (e.g. `/nl-nl.data`). Strip it before reading the
  // locale, otherwise the first path segment (`nl-nl.data`) matches no market
  // and the `($locale)` route guard would 404 on every SPA navigation.
  const pathname = rawPathname.endsWith('.data')
    ? rawPathname.slice(0, -'.data'.length)
    : rawPathname;

  const firstPathPart = '/' + (pathname.split('/')[1]?.toLowerCase() ?? '');

  const matched = SUPPORTED_LOCALES.find(
    (locale) => locale.pathPrefix.toLowerCase() === firstPathPart,
  );

  const locale = matched ?? DEFAULT_LOCALE;

  return {
    language: locale.language,
    country: locale.country,
    pathPrefix: locale.pathPrefix,
  };
}
