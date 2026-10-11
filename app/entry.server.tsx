import {ServerRouter} from 'react-router';
import {isbot} from 'isbot';
import {renderToReadableStream} from 'react-dom/server';
import {
  createContentSecurityPolicy,
  type HydrogenRouterContextProvider,
} from '@shopify/hydrogen';
import type {EntryContext} from 'react-router';
import {seedMetaCookies} from '~/lib/meta-cookies.server';
// Side effect: registers all six language maps for server rendering.
import '~/lib/translations.server';

/**
 * How long React Router keeps streaming deferred loader data before it gives
 * up and REJECTS whatever is still pending on the client.
 *
 * The default is 4.95s. A homepage for a market nobody has visited in the
 * last hour has a cold sub-request cache and can take longer than that, and
 * when it did the browser received "Unexpected Server Error" for
 * `homeProducts` — which, with no errorElement on the <Await>, replaced the
 * whole page with the root ErrorBoundary ("Something went wrong") even though
 * the server-rendered HTML was perfectly fine. PageSpeed caught exactly that.
 *
 * Slow data arriving late is always better than a broken page, so give it
 * room. Every <Await> also carries an errorElement now, as the second net.
 */
export const streamTimeout = 20_000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
  context: HydrogenRouterContextProvider,
) {
  const {nonce, header, NonceProvider} = createContentSecurityPolicy({
    shop: {
      checkoutDomain: context.env.PUBLIC_CHECKOUT_DOMAIN,
      storeDomain: context.env.PUBLIC_STORE_DOMAIN,
    },
    // Google Fonts: the hero's editorial serif (Playfair Display)
    styleSrc: [
      "'self'",
      'https://cdn.shopify.com',
      'https://fonts.googleapis.com',
    ],
    // cdn.shopify.com serves the self-hosted Inter woff2 files from Oxygen —
    // without it here they are blocked and the page falls back to system fonts.
    fontSrc: [
      "'self'",
      'https://fonts.gstatic.com',
      'https://cdn.shopify.com',
      'data:',
    ],
    // TikTok Pixel. The events.js SDK injects its own script tag, which does
    // not carry our nonce — so the host has to be allowlisted explicitly or
    // the pixel is blocked silently with only a console CSP violation.
    scriptSrc: [
      "'self'",
      'https://cdn.shopify.com',
      'https://analytics.tiktok.com',
      'https://connect.facebook.net',
      // Google Analytics 4. gtag.js is fetched from googletagmanager.com and
      // then loads further scripts of its own, none of which carry our nonce.
      'https://www.googletagmanager.com',
      // The Google Ads tag pulls a conversion helper from here.
      'https://www.googleadservices.com',
      'https://googleads.g.doubleclick.net',
    ],
    // shopify.com hosts the customer authentication endpoints the
    // <shopify-account> component calls while signing someone in. Without it
    // the sheet opens but every request inside it is blocked.
    connectSrc: [
      "'self'",
      'https://shopify.com',
      'https://cdn.shopify.com',
      'https://analytics.tiktok.com',
      'https://analytics-sg.tiktok.com',
      'https://connect.facebook.net',
      'https://www.facebook.com',
      // Hydrogen's own OpenTelemetry beacon (perf/error logging back to
      // Shopify). Harmless if blocked — no customer-facing feature depends
      // on it — but without this it fails on every page load with a CSP
      // violation logged to the console.
      'https://otlp-http-production.shopifysvc.com',
      // GA4 collect endpoints. The region-sharded hosts (region1., etc.) are
      // chosen by gtag at runtime, so the wildcard is required — without it
      // hits are blocked for some visitors and not others.
      'https://www.googletagmanager.com',
      'https://www.google-analytics.com',
      'https://analytics.google.com',
      'https://*.analytics.google.com',
      'https://*.google-analytics.com',
      // Google Ads tag (AW-…): conversion/remarketing pings. The page_view
      // hit itself goes to pagead2.googlesyndication.com/ccm/collect — verified
      // live 2026-10-05, blocked by CSP until this host was added.
      'https://pagead2.googlesyndication.com',
      'https://www.googleadservices.com',
      'https://googleads.g.doubleclick.net',
      'https://www.google.com',
      'https://td.doubleclick.net',
    ],
    // Customer avatars and the Shop Pay marks inside the account sheet.
    imgSrc: [
      "'self'",
      'https://cdn.shopify.com',
      'https://shopify.com',
      'data:',
      'https://analytics.tiktok.com',
      'https://www.facebook.com',
      // GA4 still falls back to a pixel GET when sendBeacon/fetch is blocked.
      'https://www.googletagmanager.com',
      'https://www.google-analytics.com',
      // Google Ads tag remarketing / user-list pixels (and the ccm/collect
      // image fallback on pagead2.googlesyndication.com).
      'https://pagead2.googlesyndication.com',
      'https://www.googleadservices.com',
      'https://googleads.g.doubleclick.net',
      'https://www.google.com',
      'https://*.google.com',
    ],
    // Meta's pixel opens a hidden iframe on facebook.com to sync identity
    // cookies. Without an explicit frame-src this falls back to default-src
    // and is blocked, which degrades match quality.
    frameSrc: [
      "'self'",
      // Sign in with Shop / social providers open inside the account sheet.
      'https://shopify.com',
      'https://www.facebook.com',
      'https://connect.facebook.net',
      'https://analytics.tiktok.com',
      // Google Ads tag opens a hidden iframe for its audience pings.
      'https://td.doubleclick.net',
      'https://www.googletagmanager.com',
    ],
  });

  const body = await renderToReadableStream(
    <NonceProvider>
      <ServerRouter
        context={reactRouterContext}
        url={request.url}
        nonce={nonce}
      />
    </NonceProvider>,
    {
      nonce,
      signal: request.signal,
      onError(error) {
        console.error(error);
        responseStatusCode = 500;
      },
    },
  );

  const isCrawler = isbot(request.headers.get('user-agent'));
  if (isCrawler) {
    await body.allReady;
  }

  responseHeaders.set('Content-Type', 'text/html');
  responseHeaders.set('Content-Security-Policy', header);

  // Meta match signals. See `~/lib/meta-cookies.server` for why these are
  // minted here rather than left to fbevents.js. Crawlers are skipped so the
  // feed bots do not get handed browser ids of their own.
  if (!isCrawler) {
    const {setCookie, mintedFresh} = seedMetaCookies(request);
    for (const cookie of setCookie) {
      responseHeaders.append('Set-Cookie', cookie);
    }
    if (mintedFresh) {
      // This response now carries a value unique to one visitor. Without
      // this, any shared cache in front of Oxygen could serve the same
      // `_fbp` to everyone and merge the entire audience into one browser.
      responseHeaders.set('Cache-Control', 'private, no-store');
    }
  }

  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
