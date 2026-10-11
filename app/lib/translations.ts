/**
 * Storefront copy in the seven languages the site offers.
 *
 * Each language lives in its own file under `app/lib/translations/` — one
 * English-to-<language> map per file (`de.ts`, `fr.ts`, `es.ts`, `it.ts`,
 * `sv.ts`, `tr.ts`) — rather than one big nested object. Two reasons:
 *
 *  - translating (or handing off) one language touches one file, not a
 *    shared one every other language's entries also live in;
 *  - a smaller, flatter file is easier to scan, diff, and keep in sync with
 *    the English source than a 200-entry object nested six levels wide.
 *
 * Every map is keyed by the English sentence itself, not by invented ids
 * like `cart.checkout.button`. Two reasons, both load-bearing for a
 * codebase that was written in English first:
 *
 *  - retrofitting is a wrap, not a rewrite. `t('Add to cart')` can replace a
 *    literal in place without inventing and remembering 250 key names;
 *  - a missing translation falls back to the key, which IS the correct
 *    English. A missing entry degrades to the old behaviour rather than
 *    printing `cart.checkout.button` at a shopper.
 *
 * The trade is that changing the English text orphans its translations in
 * all six files at once. That is the right way round: an edited sentence
 * SHOULD be re-translated, and the page keeps working in the meantime.
 *
 * Product titles, descriptions, collections and menus are not here — those
 * live in Shopify and are translated with Translate & Adapt, which the
 * Storefront API serves through `@inContext(language:)`.
 */
import type {I18nLocale} from '~/lib/i18n';

export type Language = I18nLocale['language'];

/** Every language except the source one. */
type TranslatedLanguage = Exclude<Language, 'EN'>;
type Dictionary = Record<string, string>;

/**
 * HOW THE FILES REACH THE PAGE
 *
 * The six maps are ~60 KB each. Imported statically they all landed in one
 * shared chunk (337 KB, 78 KB gzipped — the largest script on the site, larger
 * than React) that every visitor downloaded and parsed on every page,
 * including the English-speaking majority who use none of it.
 *
 * So the browser fetches ONE file, the language it is about to render:
 *   - `entry.client` awaits `loadLanguage()` for the URL's language before it
 *     hydrates, so the first client render matches the server's HTML;
 *   - switching language without a reload is covered by `useTranslate`, which
 *     loads the new file and re-renders when it lands (English meanwhile).
 * The server cannot wait on a fetch mid-render, so it registers all six up
 * front — see `translations.server.ts`, imported by `entry.server`.
 *
 * `Partial` because `Language` is Shopify's full `LanguageCode` enum and this
 * store ships translations for six of them.
 */
const LOADERS: Partial<Record<TranslatedLanguage, () => Promise<Dictionary>>> = {
  DE: () => import('./translations/de').then((module) => module.DE),
  FR: () => import('./translations/fr').then((module) => module.FR),
  ES: () => import('./translations/es').then((module) => module.ES),
  IT: () => import('./translations/it').then((module) => module.IT),
  SV: () => import('./translations/sv').then((module) => module.SV),
  TR: () => import('./translations/tr').then((module) => module.TR),
};

const DICTIONARIES: Partial<Record<TranslatedLanguage, Dictionary>> = {};
const PENDING: Partial<Record<TranslatedLanguage, Promise<void>>> = {};
const listeners = new Set<() => void>();

/** Make a language available to `translate`. Idempotent. */
export function registerLanguage(language: Language, dictionary: Dictionary) {
  if (language === 'EN') return;
  DICTIONARIES[language as TranslatedLanguage] = dictionary;
  for (const listener of listeners) listener();
}

/** True when `translate` can already answer in this language. English and
 *  languages we do not ship are always "ready": there is nothing to wait for. */
export function isLanguageReady(language: Language): boolean {
  if (language === 'EN') return true;
  const key = language as TranslatedLanguage;
  return !(key in LOADERS) || key in DICTIONARIES;
}

/** Fetch a language file once. Never rejects: a failed download leaves the
 *  page in English, which is correct copy, rather than breaking it. */
export function loadLanguage(language: Language): Promise<void> {
  if (isLanguageReady(language)) return Promise.resolve();
  const key = language as TranslatedLanguage;
  PENDING[key] ??= LOADERS[key]!()
    .then((dictionary) => registerLanguage(key, dictionary))
    .catch(() => {
      // Let a later render try again.
      delete PENDING[key];
    });
  return PENDING[key];
}

/** For `useSyncExternalStore`: fires whenever a language becomes available. */
export function subscribeToLanguages(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The English sentence, translated — or handed straight back when there is
 * nothing better to say. Never throws and never returns an empty string, so a
 * gap in any one language's file is invisible rather than broken.
 */
export function translate(text: string, language: Language): string {
  if (language === 'EN') return text;
  return DICTIONARIES[language as TranslatedLanguage]?.[text] ?? text;
}
