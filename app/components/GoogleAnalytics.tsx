import {startTransition, useEffect} from 'react';
import {useLocation} from 'react-router';
import {useAnalytics} from '@shopify/hydrogen';
import {buildEventProperties} from '~/lib/google';
import {
  hasUserInteracted,
  isLikelyBot,
  watchForUserInteraction,
  whenVisitorEngages,
} from '~/lib/pixels';

/**
 * Google Analytics 4 for the Hydrogen storefront.
 *
 * Same rationale as MetaPixel and TikTokPixel: Shopify's Web Pixels Manager
 * does not run on a headless storefront, so the Google & YouTube channel's
 * GA4 connection only instruments Shopify-hosted surfaces. On this store that
 * means the checkout — and, until the redirect theme is replaced, a domain no
 * one browses. Everything that happens on fastsneakers.com has to be
 * sent from here.
 *
 * Deliberately NOT fired here: `begin_checkout` and `purchase`. The Google &
 * YouTube app is connected to this same GA4 property, so Shopify's hosted
 * checkout already emits both. Firing them here too would double-count
 * revenue — exactly the reason MetaPixel omits InitiateCheckout.
 *
 * IMPORTANT — why this loads imperatively instead of rendering a <script>:
 * gtag.js appends further script elements of its own as soon as it runs.
 * Doing that inside the React tree during hydration throws React #418/#423
 * and drops the whole root to client rendering. Loading from an effect (after
 * hydration) and appending to <head> keeps it clear of React.
 *
 * Consent: Google Consent Mode v2 starts denied and is only granted once
 * Hydrogen's `canTrack()` says so, which is what the EU/EEA banner drives.
 */

type GtagArgs = [string, ...unknown[]];

declare global {
  interface Window {
    gtag?: (...args: GtagArgs) => void;
    dataLayer?: unknown[];
  }
}

const SDK_URL = 'https://www.googletagmanager.com/gtag/js';

/** Consent Mode v2 signals, all of which start denied for every visitor. */
const CONSENT_KEYS = [
  'ad_storage',
  'ad_user_data',
  'ad_personalization',
  'analytics_storage',
] as const;

function consentPayload(state: 'granted' | 'denied') {
  return Object.fromEntries(CONSENT_KEYS.map((key) => [key, state]));
}

/**
 * Port of Google's official base snippet, minus the DOM-mutating insert.
 *
 * `arguments` is load-bearing: gtag.js replays the dataLayer queue and treats
 * each entry as an arguments object, so pushing a real array instead breaks
 * every queued call. Kept as Google ships it rather than rewritten.
 */
function loadGtag(measurementId: string, adsId?: string) {
  if (typeof window === 'undefined' || window.gtag) return;

  window.dataLayer = window.dataLayer || [];
  const gtag = function () {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  } as (...args: GtagArgs) => void;
  window.gtag = gtag;

  // Consent defaults MUST be queued before `config`, or the first hit is sent
  // with storage already granted and the banner becomes decorative.
  gtag('consent', 'default', {
    ...consentPayload('denied'),
    // Give the banner a moment to answer before the first hit is redacted,
    // so a visitor who accepts immediately is still measured properly.
    wait_for_update: 500,
  });
  gtag('js', new Date());
  // page_view is left to gtag.js. See the note on PAGE VIEW OWNERSHIP below
  // for why this is not fired manually.
  gtag('config', measurementId, {send_page_view: true});
  // Google Ads tag (AW-…). Same gtag.js instance, second destination. This is
  // what Google Ads looks for when it checks "is the Google tag installed on
  // fastsneakers.com" — the GA4 ID alone does not satisfy that check.
  // It also feeds remarketing audiences. Purchases are still NOT sent from
  // here: the Google & YouTube app's checkout tag already reports them to
  // this same AW account, so sending them again would double-count.
  if (adsId) gtag('config', adsId);

  // The dataLayer above already holds consent, `js` and `config`; gtag.js
  // replays it whenever it arrives, so it can wait until the page has
  // finished loading. See `whenVisitorEngages` in ~/lib/pixels.
  whenVisitorEngages(() => {
    const script = document.createElement('script');
    script.async = true;
    script.src = `${SDK_URL}?id=${encodeURIComponent(measurementId)}`;
    // <head> is outside the hydrated tree, so this cannot disturb React.
    document.head.appendChild(script);
  });
}

/**
 * The visitor's current answer, split the way Consent Mode wants it.
 *
 * Hydrogen's `canTrack()` only reports ANALYTICS consent, but the Google Ads
 * signals (`ad_storage`, `ad_user_data`, `ad_personalization`) belong to the
 * MARKETING answer. Read both straight from Shopify's Customer Privacy API so
 * a visitor who accepts analytics but declines marketing is not counted as
 * having granted ads, and vice versa. Falls back to `canTrack()` for both
 * while the API is still loading.
 */
type ConsentState = {analytics: boolean; marketing: boolean};
function readConsent(fallback: boolean): ConsentState {
  try {
    const privacy = (
      window as unknown as {
        Shopify?: {
          customerPrivacy?: {
            analyticsProcessingAllowed?: () => boolean;
            marketingAllowed?: () => boolean;
          };
        };
      }
    ).Shopify?.customerPrivacy;
    if (privacy?.analyticsProcessingAllowed && privacy?.marketingAllowed) {
      return {
        analytics: Boolean(privacy.analyticsProcessingAllowed()),
        marketing: Boolean(privacy.marketingAllowed()),
      };
    }
  } catch {
    // fall through
  }
  return {analytics: fallback, marketing: fallback};
}

/**
 * Push a consent update only when the answer has actually changed.
 *
 * Every event handler calls this before sending, so without the latch GA
 * would receive a consent update alongside each hit.
 */
let lastConsent: string | null = null;
function syncConsent(state: ConsentState) {
  const key = `${state.analytics}|${state.marketing}`;
  if (lastConsent === key) return;
  lastConsent = key;
  const ads = state.marketing ? 'granted' : 'denied';
  window.gtag?.('consent', 'update', {
    analytics_storage: state.analytics ? 'granted' : 'denied',
    ad_storage: ads,
    ad_user_data: ads,
    ad_personalization: ads,
  });
}

export function GoogleAnalytics({
  measurementId,
  adsId,
}: {
  measurementId?: string;
  /** Google Ads tag ID, `AW-XXXXXXXXXX`. Only loaded alongside GA4. */
  adsId?: string;
}) {
  const location = useLocation();
  const {subscribe, register, canTrack} = useAnalytics();
  const {ready} = register('Google Analytics');

  // Armed unconditionally: the add_to_cart guard below must not depend on
  // whether a measurement id happens to be configured.
  useEffect(() => {
    watchForUserInteraction();
  }, []);

  // Load the SDK after hydration.
  useEffect(() => {
    if (!measurementId) return;
    // Crawlers never get the SDK at all, so there is nothing for a stray
    // `window.gtag` call to reach. See `isLikelyBot()` in ~/lib/pixels.
    if (isLikelyBot()) return;
    loadGtag(measurementId, adsId);
  }, [measurementId, adsId]);

  /*
   * PAGE VIEW OWNERSHIP
   *
   * gtag.js owns page_view, not this component. `config` above fires one on
   * the initial load, and enhanced measurement's "page changes based on
   * browser history events" fires one per client-side navigation — React
   * Router's pushState triggers it, and the hits carry the correct `dl` and
   * `dt`.
   *
   * It was the other way round at first: `send_page_view: false` plus a
   * manual page_view here, with the history-events option turned off in the
   * GA admin. That is the more precise arrangement and it does not work,
   * because the setting will not stay off. It was unchecked and saved twice —
   * once in the stream-creation wizard, once from the stream's own settings
   * panel — and both times it was checked again when re-opened, while
   * production kept sending TWO page_view hits per navigation (one with `dp`
   * from this component, one with `dr` from gtag).
   *
   * So the code now assumes the setting is on, which is its default and the
   * state it keeps returning to. If anyone ever does manage to turn it off,
   * client-side navigations will stop being counted and this decision needs
   * revisiting.
   *
   * Consent still has to be pushed as the banner is answered, which is all
   * this effect does now.
   */
  useEffect(() => {
    if (!measurementId) return;
    if (isLikelyBot()) return;
    syncConsent(readConsent(canTrack()));
  }, [measurementId, location.pathname, location.search, canTrack]);

  // Push the answer the MOMENT the cookie banner is clicked. Hydrogen only
  // re-creates `canTrack` once (when the privacy API first loads), not when
  // the visitor later accepts, so the effect above would otherwise wait for
  // the next navigation or event — and the page_view / Google Ads hits sent
  // in between stayed "denied" even for visitors who had just accepted.
  useEffect(() => {
    if (!measurementId) return;
    if (isLikelyBot()) return;
    const onConsent = (event: Event) => {
      const detail = (event as CustomEvent<{
        analyticsAllowed?: boolean;
        marketingAllowed?: boolean;
      }>).detail;
      const current = readConsent(canTrack());
      syncConsent({
        analytics: detail?.analyticsAllowed ?? current.analytics,
        marketing: detail?.marketingAllowed ?? current.marketing,
      });
    };
    document.addEventListener('visitorConsentCollected', onConsent);
    return () =>
      document.removeEventListener('visitorConsentCollected', onConsent);
  }, [measurementId, canTrack]);

  useEffect(() => {
    // `ready()` must ALWAYS be called — see the note in TikTokPixel.
    // Wrapped in startTransition so it cannot interrupt a Suspense boundary
    // that is still hydrating (React #421).
    const markReady = () => startTransition(() => ready());

    if (!measurementId) {
      markReady();
      return;
    }

    const track = (event: string, properties: Record<string, unknown>) => {
      if (isLikelyBot()) return;
      // Consent Mode handles a denied visitor by redacting the hit rather
      // than dropping it, which is what keeps Google's modelled conversions
      // working — so unlike the ad pixels this sends either way and lets
      // gtag apply the current consent state.
      syncConsent(readConsent(canTrack()));
      window.gtag?.('event', event, properties);
    };

    subscribe('product_viewed', (payload) => {
      const products = payload?.products ?? [];
      if (!products.length) return;
      const currency = payload?.shop?.currency ?? 'EUR';
      track('view_item', buildEventProperties(products, currency));
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
        'add_to_cart',
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
      );
    });

    subscribe('search_viewed', (payload) => {
      if (!payload?.searchTerm) return;
      track('search', {search_term: payload.searchTerm});
    });

    markReady();
    // `subscribe` is stable for the lifetime of the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measurementId]);

  // Renders nothing — everything happens in effects, after hydration.
  return null;
}
