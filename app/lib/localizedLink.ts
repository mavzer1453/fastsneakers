import {useRouteLoaderData} from 'react-router';
import {DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale} from '~/lib/i18n';

/**
 * The active locale (language + currency + prefix), resolved from the root
 * loader's `selectedLocale`. Falls back to the default (English + EUR).
 */
export function useSelectedLocale(): Locale {
  const root = useRouteLoaderData('root') as
    | {selectedLocale?: {country?: string; language?: string}}
    | undefined;
  const locale = root?.selectedLocale;
  return (
    SUPPORTED_LOCALES.find(
      (l) => l.country === locale?.country && l.language === locale?.language,
    ) ?? DEFAULT_LOCALE
  );
}

/**
 * Returns the active market's URL prefix (e.g. `/de-de`, or `''` for the
 * default market). Derived from the locale the root loader resolved from
 * the request URL.
 */
export function useLocalePrefix(): string {
  return useSelectedLocale().pathPrefix;
}

/**
 * Hook that returns a function to prefix an internal path with the active
 * market prefix, so navigation keeps the shopper in the same currency /
 * language. External URLs and already-prefixed paths are returned unchanged.
 *
 * Usage:
 *   const localize = useLocalizedHref();
 *   <Link to={localize('/collections')}>Shop</Link>
 */
export function useLocalizedHref(): (path: string) => string {
  const prefix = useLocalePrefix();
  return (path: string) => {
    if (!path?.startsWith('/')) return path;
    if (prefix && (path === prefix || path.startsWith(prefix + '/'))) {
      return path;
    }
    return prefix + path;
  };
}
