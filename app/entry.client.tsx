import {HydratedRouter} from 'react-router/dom';
import {startTransition, StrictMode} from 'react';
import {hydrateRoot} from 'react-dom/client';
import {NonceProvider} from '@shopify/hydrogen';
import {getLocaleFromPathname} from '~/lib/i18n';
import {loadLanguage} from '~/lib/translations';

if (!window.location.origin.includes('webcache.googleusercontent.com')) {
  /*
   * The server rendered this page in the URL's language, so that language's
   * copy has to be in memory BEFORE hydration or the first client render
   * would come out in English and React would throw the server HTML away.
   * For English this resolves immediately; for the others it is one ~13 KB
   * file instead of the 78 KB all-languages chunk every page used to carry.
   * `loadLanguage` never rejects, so hydration always runs.
   */
  const {language} = getLocaleFromPathname(window.location.pathname);
  void loadLanguage(language).then(hydrate);
}

function hydrate() {
  startTransition(() => {
    // Extract nonce from existing script tags
    const existingNonce =
      document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce;

    hydrateRoot(
      document,
      <StrictMode>
        <NonceProvider value={existingNonce}>
          <HydratedRouter />
        </NonceProvider>
      </StrictMode>,
    );
  });
}
