/**
 * Meta (Facebook/Instagram) Pixel mapping for the Hydrogen storefront.
 *
 * Generic cookie/id helpers live in `~/lib/pixels`.
 *
 * `content_ids` uses the numeric ProductVariant id. This must match the id
 * used by whatever feed populates your Meta catalog — if the storefront sends
 * variant ids and the catalog is keyed on product ids, Advantage+ catalog ads
 * and dynamic retargeting will match nothing.
 */

import {
  FBC_COOKIE,
  FBP_COOKIE,
  FB_COOKIE_MAX_AGE_DAYS,
  formatFbc,
  getOrCreateExternalId,
  gidToId,
  readCookie,
  rootCookieDomain,
  toNumber,
  writeRootCookie,
  type ProductLike,
} from '~/lib/pixels';
import {readIdentity} from '~/lib/identity';

export {
  ensureFbp,
  FBC_COOKIE,
  FBP_COOKIE,
  getOrCreateExternalId,
  gidToId,
  newEventId,
  readCookie,
  toNumber,
} from '~/lib/pixels';

/** Browser events mirrored server-side through the Conversions API. */
export const CAPI_EVENTS = [
  'PageView',
  'ViewContent',
  'AddToCart',
  'Search',
] as const;
export type CapiEventName = (typeof CAPI_EVENTS)[number];

/** First-party relay route; forwards to graph.facebook.com on the server. */
export const CAPI_ENDPOINT = '/api/meta-events';

/**
 * Mirror a browser pixel event to our own server, which forwards it to Meta's
 * Conversions API. Browser and server copies share the same `event_id`, so
 * Meta deduplicates the pair — the server copy only "wins" when an ad blocker
 * or browser privacy feature swallowed the browser one.
 *
 * Fire-and-forget: must never throw or slow down the storefront.
 */
export function relayToConversionsApi(
  eventName: CapiEventName,
  eventId: string,
  customData?: Record<string, unknown>,
) {
  if (typeof window === 'undefined') return;
  try {
    // Meta's SDK ignores automated browsers — keep server parity with that.
    if (navigator.webdriver) return;
    const payload = JSON.stringify({
      event_name: eventName,
      event_id: eventId,
      event_source_url: window.location.href,
      custom_data: customData,
      // When the event actually happened. Beacons queued on page unload can
      // reach the server seconds later, and the server stamping its own
      // receipt time would drift the event away from the browser copy.
      event_time: Math.floor(Date.now() / 1000),
      // Stable visitor id — the single biggest Event Match Quality lift
      // available without collecting personal data.
      external_id: getOrCreateExternalId(),
      // Fallbacks for the server in case the beacon loses cookies.
      fbp: readCookie(FBP_COOKIE),
      fbc: readCookie(FBC_COOKIE),
      // Already SHA-256 hashed at the point of capture — see `~/lib/identity`.
      // The relay route re-checks the shape and drops anything that is not a
      // 64-char digest, so no raw address can reach Meta through here.
      ...readIdentity(),
    });
    const sent = navigator.sendBeacon?.(
      CAPI_ENDPOINT,
      new Blob([payload], {type: 'application/json'}),
    );
    if (!sent) {
      void fetch(CAPI_ENDPOINT, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: payload,
        keepalive: true,
      });
    }
  } catch {
    // Analytics must never break the storefront.
  }
}

export type MetaContent = {
  id: string;
  quantity: number;
  item_price?: number;
};

export type MetaEventProperties = {
  content_ids: string[];
  contents: MetaContent[];
  content_type: 'product';
  content_name?: string;
  content_category?: string;
  /** Human-readable variant, e.g. "S / Black". The variant id in
   * `content_ids` is what actually identifies size+color for the catalog;
   * this is for readability and custom conversion rules. */
  content_variant?: string;
  num_items: number;
  value: number;
  currency: string;
};

/**
 * Persist the Meta click id in the exact format Meta expects:
 *   fb.<subdomainIndex>.<creationTime>.<fbclid>
 * A malformed value is silently discarded by Meta, so we only ever write a
 * value we've constructed ourselves, and we never clobber one the pixel
 * already set.
 */
export function captureFbclid(): string | undefined {
  if (typeof window === 'undefined') return undefined;

  const existing = readCookie(FBC_COOKIE);
  const fromUrl = new URLSearchParams(window.location.search).get('fbclid');
  if (!fromUrl) return existing;

  // The server already wrote this on the document response; re-writing it
  // client-side would only reset the click timestamp. Rewrite ONLY when the
  // click id genuinely changed — Meta attributes to the most recent click,
  // and a client-side navigation carrying a new fbclid never reaches the
  // document handler.
  if (existing?.endsWith(`.${fromUrl}`)) return existing;

  const formatted = formatFbc(
    fromUrl,
    rootCookieDomain(window.location.hostname) ? 1 : 0,
  );
  writeRootCookie(FBC_COOKIE, formatted, FB_COOKIE_MAX_AGE_DAYS);
  return formatted;
}

/** Map a Hydrogen analytics product into a Meta `contents` entry. */
export function toContent(product: ProductLike): MetaContent {
  const variantId = gidToId(product.variantId);
  const productId = gidToId(product.productId ?? product.id);
  return {
    id: variantId || productId,
    quantity: product.quantity ?? 1,
    item_price: toNumber(product.price),
  };
}

/** Build the standard properties block Meta expects for commerce events. */
export function buildEventProperties(
  products: ProductLike[],
  currency: string,
): MetaEventProperties {
  const contents = products.map(toContent);
  const value = contents.reduce(
    (sum, content) => sum + (content.item_price ?? 0) * (content.quantity ?? 1),
    0,
  );
  const numItems = contents.reduce(
    (sum, content) => sum + (content.quantity ?? 1),
    0,
  );
  const variantTitle = products[0]?.variantTitle ?? undefined;
  return {
    content_ids: contents.map((content) => content.id),
    contents,
    content_type: 'product',
    content_name: products[0]?.title ?? undefined,
    content_category: products[0]?.productType ?? undefined,
    content_variant:
      variantTitle && variantTitle !== 'Default Title'
        ? variantTitle
        : undefined,
    num_items: numItems,
    value: Number(value.toFixed(2)),
    currency,
  };
}
