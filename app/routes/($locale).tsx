import {redirect, type LoaderFunctionArgs} from 'react-router';
import {DEFAULT_LOCALE, SUPPORTED_LOCALES} from '~/lib/i18n';

export async function loader({params, request}: LoaderFunctionArgs) {
  const raw = params.locale;
  if (!raw) return null;

  const lower = raw.toLowerCase();
  const url = new URL(request.url);
  // Defensive: strip React Router's single-fetch suffix if present.
  const pathname = url.pathname.replace(/\.data$/, '');
  const rest = pathname.slice(raw.length + 1) || '/';

  // The default market lives at the un-prefixed root: 301 `/en-us/...` to
  // `/...` so the same page is never indexable under two URLs.
  const defaultSlug =
    `${DEFAULT_LOCALE.language}-${DEFAULT_LOCALE.country}`.toLowerCase();
  if (lower === defaultSlug) {
    throw redirect(rest + url.search, 301);
  }

  const match = SUPPORTED_LOCALES.find(
    (locale) => locale.pathPrefix === `/${lower}`,
  );

  // A locale-shaped prefix we no longer serve is a MOVED page, not a
  // missing one.
  //
  // Dutch was this storefront's original language and was later dropped from
  // LANGUAGES. Google still holds 111 `/nl-nl/...` URLs — products and
  // collections that almost all still exist — and every one of them was
  // answering a hard 404, throwing away the only inbound equity those pages
  // had. The 2026-09-20 Search Console export is 118 404s, 111 of them
  // `/nl-nl/`.
  //
  // The segment has to LOOK like a locale (`xx-yy`) to qualify, so a genuine
  // unknown path such as `/some-page` still 404s as it should. No top-level
  // route is shaped that way.
  //
  // When the language itself is still supported but the country half is not
  // (`/de-xx/`), keep the language and land on its euro URL. When the
  // language is gone entirely, the default market is the un-prefixed path —
  // which for EN is already the Netherlands/EUR market, so a Dutch visitor
  // lands exactly where they should.
  if (!match) {
    if (/^[a-z]{2}-[a-z]{2}$/.test(lower)) {
      const language = lower.slice(0, 2);
      const sameLanguage = SUPPORTED_LOCALES.find(
        (locale) =>
          locale.language.toLowerCase() === language &&
          locale.currency === 'EUR',
      );
      throw redirect((sameLanguage?.pathPrefix ?? '') + rest + url.search, 301);
    }
    throw new Response(null, {status: 404});
  }

  // Case variants (e.g. /DE-DE/...) → 301 to the canonical lowercase prefix.
  if (`/${raw}` !== match.pathPrefix) {
    throw redirect(match.pathPrefix + rest + url.search, 301);
  }

  return null;
}
