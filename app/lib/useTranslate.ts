import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {useRouteLoaderData} from 'react-router';
import type {RootLoader} from '~/root';
import {
  isLanguageReady,
  loadLanguage,
  subscribeToLanguages,
  translate,
  type Language,
} from '~/lib/translations';

/**
 * The active language, read from the locale the root loader resolved out of
 * the URL prefix. English whenever that is unavailable — during an error
 * boundary render, say — because English is the source copy and is never
 * wrong, only untranslated.
 */
export function useLanguage(): Language {
  const data = useRouteLoaderData<RootLoader>('root');
  return (data?.selectedLocale?.language as Language) ?? 'EN';
}

/** Flips when the active language's copy becomes available; see below. */
const LanguageReadyContext = createContext(true);

/**
 * Wraps the app once (in root.tsx) and owns the ONE subscription to the
 * language registry.
 *
 * The browser holds only the language it loaded before hydrating (see
 * ~/lib/translations). After a language switch without a reload the new file
 * is not there yet: this asks for it, and when it lands the context value
 * flips, which re-renders every `useTranslate` consumer — the copy is English
 * for that beat, never broken. The server snapshot is `true` because the
 * server always has every language, and the browser's is `true` at hydration
 * because entry.client loaded the file first, so hydration never re-renders.
 *
 * A context rather than a subscription inside `useTranslate` itself: that
 * hook runs in several hundred components on the homepage, and a store
 * subscription plus an effect in each of them is work hydration can do
 * without. Reading a context costs nothing extra.
 */
export function LanguageProvider({children}: {children: ReactNode}) {
  const language = useLanguage();
  const ready = useSyncExternalStore(
    subscribeToLanguages,
    () => isLanguageReady(language),
    () => true,
  );
  useEffect(() => {
    if (!ready) void loadLanguage(language);
  }, [language, ready]);
  // createElement, not JSX: this file is .ts on purpose (every component
  // imports it by that path).
  return createElement(LanguageReadyContext.Provider, {value: ready}, children);
}

/**
 * `const t = useTranslate()` then `t('Add to cart')`.
 *
 * The English sentence is the key, so a component reads the same as it did
 * before it was wrapped, and an untranslated string still renders correctly.
 */
export function useTranslate(): (text: string) => string {
  const language = useLanguage();
  // Read only to re-render when the language file arrives.
  useContext(LanguageReadyContext);
  return (text: string) => translate(text, language);
}
