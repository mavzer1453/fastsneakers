import {startTransition, useEffect, useRef} from 'react';
import {useLocation} from 'react-router';
import {useAnalytics} from '@shopify/hydrogen';
import {
  buildEventProperties,
  captureFbclid,
  ensureFbp,
  getOrCreateExternalId,
  newEventId,
  relayToConversionsApi,
  type CapiEventName,
} from '~/lib/meta';
import {
  IDENTITY_EVENT,
  readIdentity,
  rememberHashedIdentity,
  type HashedIdentity,
} from '~/lib/identity';
import {
  hasUserInteracted,
  isLikelyBot,
  whenVisitorEngages,
  watchForUserInteraction,
} from '~/lib/pixels';

/**
 * Meta (Facebook/Instagram) Pixel for the Hydrogen storefront.
 *
 * Same rationale as TikTokPixel: Shopify app pixels are not injected into
 * headless storefronts. Purchase comes from the Shopify-hosted checkout, so we
 * deliberately do NOT fire it here — that would double-count revenue.
 *
 * IMPORTANT — why this loads imperatively instead of rendering a <script>:
 * Meta's base code inserts a new <script> element into the DOM as soon as it
 * runs. Rendering it inside the React tree meant that insertion happened while
 * React was hydrating, which threw React #418/#423 and forced the whole root
 * to fall back to client rendering. Loading from an effect (after hydration)
 * and appending to <head> keeps it clear of React.
 *
 * Consent: every call is gated on Hydrogen's `canTrack()`.
 */

declare global {
  interface Window {
    fbq?: any;
    _fbq?: any;
  }
}

const SDK_URL = 'https://connect.facebook.net/en_US/fbevents.js';

/**
 * Port of Meta's official base snippet, minus the DOM-mutating insert.
 *
 * `advancedMatching` is passed straight to `fbq('init', ...)`. Meta hashes
 * anything sensitive in there itself; `external_id` is sent raw on purpose so
 * it matches the raw value the Conversions API relay sends server-side.
 */
function loadMeta(pixelId: string, advancedMatching?: Record<string, string>) {
  if (typeof window === 'undefined' || window.fbq) return;

  // Kept byte-for-byte as Meta ships it — `arguments` and `.apply` are load
  // -bearing here (fbevents.js replays the queue with `.apply`), so the
  // lint rules are silenced rather than the snippet rewritten.
  const fbq: any = function () {
    /* eslint-disable-next-line @typescript-eslint/no-unused-expressions */
    fbq.callMethod
      ? // eslint-disable-next-line prefer-rest-params, prefer-spread
        fbq.callMethod.apply(fbq, arguments)
      : // eslint-disable-next-line prefer-rest-params
        fbq.queue.push(arguments);
  };

  window.fbq = fbq;
  if (!window._fbq) window._fbq = fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.queue = [];

  // The stub above queues everything; the SDK itself can wait until the page
  // has finished loading and the visitor is active. See `whenVisitorEngages` in ~/lib/pixels.
  whenVisitorEngages(() => {
    const script = document.createElement('script');
    script.async = true;
    script.src = SDK_URL;
    // <head> is outside the hydrated tree, so this cannot disturb React.
    document.head.appendChild(script);
  });

  if (advancedMatching && Object.keys(advancedMatching).length > 0) {
    fbq('init', pixelId, advancedMatching);
  } else {
    fbq('init', pixelId);
  }
}

/**
 * Everything Meta can match a visitor on, in the shape `fbq('init', ...)`
 * wants. `external_id` is our own random visitor id; `em`/`ph`/`fn`/`ln` are
 * SHA-256 digests produced at the point of capture, never raw values.
 *
 * Meta accepts pre-hashed advanced matching as long as the value is a plain
 * lowercase hex digest, which is exactly what `~/lib/identity` stores — so the
 * browser copy and the Conversions API copy send byte-identical strings and
 * resolve to the same person.
 */
function buildAdvancedMatching(
  identity: HashedIdentity,
): Record<string, string> {
  const matching: Record<string, string> = {};
  const externalId = getOrCreateExternalId();
  if (externalId) matching.external_id = externalId;
  if (identity.em) matching.em = identity.em;
  if (identity.ph) matching.ph = identity.ph;
  if (identity.fn) matching.fn = identity.fn;
  if (identity.ln) matching.ln = identity.ln;
  return matching;
}

export function MetaPixel({
  pixelId,
  identity,
}: {
  pixelId?: string;
  /**
   * Hashes computed on the server for a signed-in customer. Optional: a
   * signed-out visitor simply has none, and one captured later in the session
   * (newsletter signup) arrives through the IDENTITY_EVENT listener below.
   */
  identity?: HashedIdentity | Promise<HashedIdentity | null> | null;
}) {
  const location = useLocation();
  const {subscribe, register, canTrack} = useAnalytics();
  const {ready} = register('Meta Pixel');
  const lastPagePath = useRef<string | null>(null);

  // Armed unconditionally: the AddToCart guard below must not depend on
  // whether a pixel id happens to be configured.
  useEffect(() => {
    watchForUserInteraction();
  }, []);

  // Load the SDK and capture the match cookies, after hydration.
  useEffect(() => {
    if (!pixelId) return;
    // Crawlers never get the SDK at all, so there is nothing for a stray
    // `window.fbq` call to reach. See `isLikelyBot()` in ~/lib/pixels.
    if (isLikelyBot()) return;

    // ORDER MATTERS. Both of these must run before fbevents.js executes:
    // `ensureFbp` so the SDK adopts our `_fbp` instead of minting a second
    // one, and `captureFbclid` so `_fbc` is already on the jar when the first
    // event fires. The server normally has both set before this code ever
    // runs (see ~/lib/meta-cookies.server); these are the fallback.
    ensureFbp();
    captureFbclid();

    loadMeta(pixelId, buildAdvancedMatching(readIdentity()));
  }, [pixelId]);

  // Promote server-computed customer hashes into the shared cookies, so the
  // relay picks them up on every later event and they survive a sign-out ->
  // browse -> return cycle the same way `external_id` does.
  useEffect(() => {
    if (!identity) return;
    // Streamed from the root loader, so it may still be a promise. Resolving
    // it in an effect rather than with <Await> keeps it off the render path
    // entirely — nothing visible depends on it, and it never rejects.
    let cancelled = false;
    void Promise.resolve(identity).then((resolved) => {
      if (cancelled || !resolved) return;
      rememberHashedIdentity(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [identity]);

  // Re-init when a new identifier is captured mid-session. `fbq('init', ...)`
  // is idempotent per pixel id and simply replaces the advanced-matching set,
  // so every event after a newsletter signup carries the email hash without
  // waiting for a page reload.
  useEffect(() => {
    if (!pixelId) return;
    const onIdentity = () => {
      if (!window.fbq) return;
      window.fbq('init', pixelId, buildAdvancedMatching(readIdentity()));
    };
    window.addEventListener(IDENTITY_EVENT, onIdentity);
    return () => window.removeEventListener(IDENTITY_EVENT, onIdentity);
  }, [pixelId]);

  // PageView on first load and on every client-side navigation.
  useEffect(() => {
    if (!pixelId) return;
    if (!canTrack() || isLikelyBot()) return;
    const path = location.pathname + location.search;
    if (lastPagePath.current === path) return;
    lastPagePath.current = path;
    const eventId = newEventId('page');
    window.fbq?.('track', 'PageView', {}, {eventID: eventId});
    relayToConversionsApi('PageView', eventId);
  }, [pixelId, location.pathname, location.search, canTrack]);

  useEffect(() => {
    // `ready()` must ALWAYS be called — see the note in TikTokPixel.
    // Wrapped in startTransition so it cannot interrupt a Suspense boundary
    // that is still hydrating (React #421).
    const markReady = () => startTransition(() => ready());

    if (!pixelId) {
      markReady();
      return;
    }

    const track = (
      event: CapiEventName,
      properties: Record<string, unknown>,
      idPrefix: string,
    ) => {
      if (!canTrack() || isLikelyBot()) return;
      const eventId = newEventId(idPrefix);
      window.fbq?.('track', event, properties, {eventID: eventId});
      relayToConversionsApi(event, eventId, properties);
    };

    subscribe('product_viewed', (payload) => {
      const products = payload?.products ?? [];
      if (!products.length) return;
      const currency = payload?.shop?.currency ?? 'EUR';
      track('ViewContent', buildEventProperties(products, currency), 'view');
    });

    subscribe('product_added_to_cart', (payload) => {
      const line = payload?.currentLine;
      if (!line) return;
      // Hydrogen republishes this for every existing cart line on a page load
      // whose localStorage guard failed. Nobody added anything — see
      // `hasUserInteracted()` in ~/lib/pixels for the full explanation.
      if (!hasUserInteracted()) return;
      const merchandise = line.merchandise;
      const currency =
        merchandise?.price?.currencyCode ?? payload?.shop?.currency ?? 'EUR';
      track(
        'AddToCart',
        buildEventProperties(
          [
            {
              id: merchandise?.product?.id,
              variantId: merchandise?.id,
              title: merchandise?.product?.title,
              variantTitle: merchandise?.title,
              vendor: merchandise?.product?.vendor,
              productType: merchandise?.product?.productType,
              price: merchandise?.price?.amount,
              quantity: line.quantity ?? 1,
            },
          ],
          currency,
        ),
        'atc',
      );
    });

    subscribe('search_viewed', (payload) => {
      if (!payload?.searchTerm) return;
      track('Search', {search_string: payload.searchTerm}, 'search');
    });

    // NOTE: no InitiateCheckout here on purpose. The Facebook & Instagram app
    // is installed on the Shopify backend with this same pixel, so the
    // Shopify-hosted checkout already fires InitiateCheckout (plus
    // AddPaymentInfo and Purchase, browser + Conversions API). Firing it here
    // too on `custom_checkout_started` double-counted every checkout.
    // TikTokPixel keeps its InitiateCheckout because no TikTok app runs on
    // the checkout surface.

    markReady();
    // `subscribe` is stable for the lifetime of the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixelId]);

  // Renders nothing — everything happens in effects, after hydration.
  return null;
}

