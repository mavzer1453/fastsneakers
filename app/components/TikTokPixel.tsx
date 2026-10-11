import {startTransition, useEffect, useRef} from 'react';
import {useLocation} from 'react-router';
import {useAnalytics} from '@shopify/hydrogen';
import {buildEventProperties, captureTtclid, newEventId} from '~/lib/tiktok';
import {
  hasUserInteracted,
  isLikelyBot,
  watchForUserInteraction,
  whenVisitorEngages,
} from '~/lib/pixels';

/**
 * TikTok Pixel for the Hydrogen storefront.
 *
 * Shopify app pixels are not injected into headless storefronts, so this
 * component is the only thing sending storefront events to TikTok. Purchase
 * comes from the Shopify-hosted checkout, so we deliberately do NOT fire it
 * here — that would double-count revenue.
 *
 * IMPORTANT — why this loads imperatively instead of rendering a <script>:
 * TikTok's base code inserts a new <script> element into the DOM as soon as it
 * runs. Rendering it inside the React tree meant that insertion happened while
 * React was hydrating, which corrupted the tree and threw React #418/#423 —
 * forcing the whole root to fall back to client rendering. Loading it from an
 * effect (after hydration) and appending to <head> keeps it clear of React.
 *
 * Consent: every call is gated on Hydrogen's `canTrack()`, which reflects the
 * Customer Privacy API. Nothing fires before the shopper has consented.
 */

declare global {
  interface Window {
    ttq?: any;
    TiktokAnalyticsObject?: string;
  }
}

const TTQ_METHODS = [
  'page',
  'track',
  'identify',
  'instances',
  'debug',
  'on',
  'off',
  'once',
  'ready',
  'alias',
  'group',
  'enableCookie',
  'disableCookie',
  'holdConsent',
  'revokeConsent',
  'grantConsent',
];

const SDK_URL = 'https://analytics.tiktok.com/i18n/pixel/events.js';

/** Port of TikTok's official base snippet, minus the DOM-mutating insert. */
function loadTikTok(pixelId: string) {
  if (typeof window === 'undefined' || window.ttq) return;

  const ttq: any = [];
  window.ttq = ttq;
  window.TiktokAnalyticsObject = 'ttq';

  ttq.methods = TTQ_METHODS;
  // TikTok's own snippet — `arguments` is load-bearing, so the rule is
  // silenced rather than the vendor code rewritten.
  ttq.setAndDefer = function (target: any, method: string) {
    target[method] = function () {
      // eslint-disable-next-line prefer-rest-params
      target.push([method].concat(Array.prototype.slice.call(arguments, 0)));
    };
  };
  for (const method of ttq.methods) ttq.setAndDefer(ttq, method);

  ttq.instance = function (id: string) {
    const inst = ttq._i?.[id] || [];
    for (const method of ttq.methods) ttq.setAndDefer(inst, method);
    return inst;
  };

  ttq.load = function (id: string, options?: unknown) {
    ttq._i = ttq._i || {};
    ttq._i[id] = [];
    ttq._i[id]._u = SDK_URL;
    ttq._t = ttq._t || {};
    ttq._t[id] = Date.now();
    ttq._o = ttq._o || {};
    ttq._o[id] = options || {};

    // Every ttq method above already queues, so the SDK can wait until the
    // page has finished loading and the visitor is active. See `whenVisitorEngages` in ~/lib/pixels.
    whenVisitorEngages(() => {
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.async = true;
      script.src = `${SDK_URL}?sdkid=${id}&lib=ttq`;
      // <head> is outside the hydrated tree, so this cannot disturb React.
      document.head.appendChild(script);
    });
  };

  ttq.load(pixelId);
}

export function TikTokPixel({pixelId}: {pixelId?: string}) {
  const location = useLocation();
  const {subscribe, register, canTrack} = useAnalytics();
  const {ready} = register('TikTok Pixel');
  const lastPagePath = useRef<string | null>(null);

  // Load the SDK and capture the click id, after hydration.
  // Armed unconditionally: the AddToCart guard below must not depend on
  // whether a pixel id happens to be configured.
  useEffect(() => {
    watchForUserInteraction();
  }, []);

  useEffect(() => {
    if (!pixelId) return;
    // Crawlers never get the SDK at all, so there is nothing for a stray
    // `window.ttq` call to reach. See `isLikelyBot()` in ~/lib/pixels.
    if (isLikelyBot()) return;
    loadTikTok(pixelId);
    captureTtclid();
  }, [pixelId]);

  // PageView on first load and on every client-side navigation.
  useEffect(() => {
    if (!pixelId) return;
    if (!canTrack() || isLikelyBot()) return;
    const path = location.pathname + location.search;
    if (lastPagePath.current === path) return;
    lastPagePath.current = path;
    window.ttq?.page();
  }, [pixelId, location.pathname, location.search, canTrack]);

  useEffect(() => {
    // `ready()` must ALWAYS be called, even with no pixel configured. Hydrogen
    // holds every analytics event until all registered integrations report
    // ready — bailing out early would stall Shopify's own analytics too.
    // `ready()` updates provider state. Firing it while streamed Suspense
    // boundaries are still hydrating throws React #421 and forces those
    // boundaries to client-render, so mark it as a non-urgent transition.
    const markReady = () => startTransition(() => ready());

    if (!pixelId) {
      markReady();
      return;
    }

    const track = (
      event: string,
      properties: Record<string, unknown>,
      idPrefix: string,
    ) => {
      if (!canTrack() || isLikelyBot()) return;
      window.ttq?.track(event, properties, {event_id: newEventId(idPrefix)});
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
      // Same phantom-add guard as MetaPixel — the cause is Hydrogen's cart
      // diff, so it affects every pixel subscribed to this event.
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
      track('Search', {query: payload.searchTerm}, 'search');
    });

    // Published by CartSummary just before we hand off to Shopify checkout.
    subscribe('custom_checkout_started', (rawPayload) => {
      const payload = rawPayload as {cart?: Record<string, any>} | undefined;
      const cart = payload?.cart;
      const lines = cart?.lines?.nodes ?? [];
      const currency = cart?.cost?.totalAmount?.currencyCode ?? 'EUR';
      const products = lines.map((line: Record<string, any>) => ({
        id: line?.merchandise?.product?.id,
        variantId: line?.merchandise?.id,
        title: line?.merchandise?.product?.title,
        variantTitle: line?.merchandise?.title,
        vendor: line?.merchandise?.product?.vendor,
        productType: line?.merchandise?.product?.productType,
        price: line?.merchandise?.price?.amount,
        quantity: line?.quantity ?? 1,
      }));
      const properties = buildEventProperties(products, currency);
      const cartTotal = Number(cart?.cost?.totalAmount?.amount ?? 0);
      if (cartTotal > 0) properties.value = cartTotal;
      track('InitiateCheckout', properties, 'checkout');
    });

    markReady();
    // `subscribe` is stable for the lifetime of the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixelId]);

  // Renders nothing — everything happens in effects, after hydration.
  return null;
}

