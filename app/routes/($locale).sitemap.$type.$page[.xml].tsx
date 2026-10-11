import type {Route} from './+types/($locale).sitemap.$type.$page[.xml]';
import {getSitemap} from '@shopify/hydrogen';
import {DEFAULT_LOCALE, SUPPORTED_LOCALES} from '~/lib/i18n';

const DEFAULT_SLUG =
  `${DEFAULT_LOCALE.language}-${DEFAULT_LOCALE.country}`.toLowerCase();

/**
 * hreflang alternates are per LANGUAGE, not per currency — currency variants
 * of the same language serve identical content, so only the EUR (default
 * currency) locale of each language is advertised to search engines.
 */
const SITEMAP_LOCALES = SUPPORTED_LOCALES.filter(
  (locale) => locale.currency === 'EUR',
).map((locale) =>
  locale.pathPrefix ? locale.pathPrefix.slice(1) : DEFAULT_SLUG,
);

export async function loader({
  request,
  params,
  context: {storefront},
}: Route.LoaderArgs) {
  const response = await getSitemap({
    storefront,
    request,
    params,
    locales: SITEMAP_LOCALES,
    getLink: ({type, baseUrl, handle, locale}) => {
      if (!locale || locale.toLowerCase() === DEFAULT_SLUG) {
        // Default market lives at the un-prefixed root.
        return `${baseUrl}/${type}/${handle}`;
      }
      return `${baseUrl}/${locale}/${type}/${handle}`;
    },
  });

  const headers = new Headers(response.headers);
  headers.set('Cache-Control', `max-age=${60 * 60 * 24}`);

  return new Response(fixHreflang(await response.text()), {
    status: response.status,
    headers,
  });
}

/**
 * `getSitemap` prints each locale slug verbatim as the hreflang value, and
 * our slugs are URL prefixes, not targeting statements.
 *
 * `/sv-nl` exists because the Swedish EURO page is priced through the
 * Netherlands (see EUR_COUNTRY_BY_LANGUAGE in ~/lib/i18n). As an hreflang,
 * `sv-nl` means "Swedish speakers located in the Netherlands" — so Google
 * was told the Swedish page is not for Sweden, the Turkish page (`tr-nl`)
 * not for Türkiye, and the English default (`en-nl`) only for the
 * Netherlands. `de-de` likewise excluded Austria and Switzerland, whose
 * `/de-ch`-style currency variants canonicalise to `/de-de` anyway.
 *
 * There is exactly one URL per language, so the honest value is the bare
 * language code. The un-prefixed English page doubles as `x-default`, the
 * fallback for every language we do not serve.
 */
function fixHreflang(xml: string): string {
  let out = xml;
  for (const slug of SITEMAP_LOCALES) {
    const language = slug.split('-')[0];
    out = out.replaceAll(`hreflang="${slug}"`, `hreflang="${language}"`);
  }
  const defaultLanguage = DEFAULT_SLUG.split('-')[0];
  return out.replace(
    new RegExp(
      `([ \\t]*)<xhtml:link rel="alternate" hreflang="${defaultLanguage}" href="([^"]+)" ?/>`,
      'g',
    ),
    (line, indent: string, href: string) =>
      `${line}\n${indent}<xhtml:link rel="alternate" hreflang="x-default" href="${href}" />`,
  );
}
