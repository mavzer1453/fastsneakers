import * as serverBuild from 'virtual:react-router/server-build';
import {isbot} from 'isbot';
import {createRequestHandler, storefrontRedirect} from '@shopify/hydrogen';
import type {HydrogenSession} from '@shopify/hydrogen';
import {createHydrogenRouterContext} from '~/lib/context';
import {resolveLocaleForCountry, SUPPORTED_LOCALES} from '~/lib/i18n';

/**
 * First-visit geolocation: send a new visitor straight to the language and
 * currency their country normally uses (US → English/USD, Sweden →
 * Swedish/SEK, Germany → German/EUR, ...), falling back to English whenever
 * we support their currency but not their language — see
 * `resolveLocaleForCountry` in `~/lib/i18n` for the country table itself.
 *
 * Deliberately narrow about when this fires, so it can never hijack
 * anything other than a fresh, unprefixed page load:
 *  - GET requests only, and only ones a browser is making for a document
 *    (`Accept: text/html`) — not cart/account POSTs, not React Router's
 *    `.data` client-navigation fetches, not asset requests.
 *  - Never for a crawler. See the note on the isbot() guard below: this one
 *    was documented here from the start but missing from the code, and its
 *    absence was costing the entire site its index coverage.
 *  - Only when the URL has no locale prefix yet. A link that already points
 *    at `/de-de/...` is a deliberate choice (shared link, bookmark, or the
 *    site's own locale switcher) and must never be overridden.
 *  - Only once per visitor. The session flag below means a visitor who
 *    manually switches away from our guess is never dragged back to it.
 */
function getGeoRedirectUrl(
  request: Request,
  session: HydrogenSession,
): string | null {
  if (request.method !== 'GET') return null;
  if (!request.headers.get('accept')?.includes('text/html')) return null;

  // Crawlers must never be redirected by this.
  //
  // Googlebot sends `Accept: text/html` and keeps no cookies, so before this
  // guard it satisfied every other condition on EVERY request: the session
  // flag below was always unset, and Googlebot crawls predominantly from US
  // IPs, which `resolveLocaleForCountry` maps to EN + USD — a non-default
  // locale with the `/en-us` prefix.
  //
  // The result was that every unprefixed URL — the canonical ones, the ones
  // in the sitemap — answered Googlebot with a 302 to /en-us/… and never
  // rendered. Search Console showed 3,546 pages as "Page with redirect" and
  // 7,279 as "Discovered - currently not indexed", because the canonical URL
  // of essentially every page on the site was permanently unindexable.
  //
  // A real visitor still gets the geolocation guess; a crawler always gets
  // the page at the URL it asked for.
  if (isbot(request.headers.get('user-agent'))) return null;

  const url = new URL(request.url);
  const hasLocalePrefix = SUPPORTED_LOCALES.some(
    (locale) =>
      locale.pathPrefix &&
      (url.pathname === locale.pathPrefix ||
        url.pathname.startsWith(locale.pathPrefix + '/')),
  );
  if (hasLocalePrefix) return null;

  if (session.get('geoLocaleChecked')) return null;
  session.set('geoLocaleChecked', '1');

  const country = request.headers.get('oxygen-buyer-country');
  const target = resolveLocaleForCountry(country);
  if (!target || !target.pathPrefix) return null;

  return target.pathPrefix + url.pathname + url.search;
}

/**
 * Export a fetch handler in module format.
 */
export default {
  async fetch(
    request: Request,
    env: Env,
    executionContext: ExecutionContext,
  ): Promise<Response> {
    try {
      const hydrogenContext = await createHydrogenRouterContext(
        request,
        env,
        executionContext,
      );

      const geoRedirectUrl = getGeoRedirectUrl(request, hydrogenContext.session);
      if (geoRedirectUrl) {
        const headers = new Headers({Location: geoRedirectUrl});
        if (hydrogenContext.session.isPending) {
          headers.set('Set-Cookie', await hydrogenContext.session.commit());
        }
        return new Response(null, {status: 302, headers});
      }

      /**
       * Create a Hydrogen request handler that internally
       * delegates to React Router for routing and rendering.
       */
      const handleRequest = createRequestHandler({
        build: serverBuild,
        mode: process.env.NODE_ENV,
        getLoadContext: () => hydrogenContext,
      });

      const response = await handleRequest(request);

      if (hydrogenContext.session.isPending) {
        // `append`, not `set`: the document response already carries the Meta
        // match cookies (`_fbp`/`_fbc`) from entry.server, and `set` would
        // silently drop them whenever the session also needed committing —
        // which is exactly the first visit, the one visit where they matter.
        response.headers.append(
          'Set-Cookie',
          await hydrogenContext.session.commit(),
        );
      }

      if (response.status === 404) {
        /**
         * Check for redirects only when there's a 404 from the app.
         * If the redirect doesn't exist, then `storefrontRedirect`
         * will pass through the 404 response.
         */
        return storefrontRedirect({
          request,
          response,
          storefront: hydrogenContext.storefront,
        });
      }

      return response;
    } catch (error) {
      console.error(error);
      return new Response('An unexpected error occurred', {status: 500});
    }
  },
};
