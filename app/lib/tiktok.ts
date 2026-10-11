/**
 * TikTok Pixel mapping for the Hydrogen storefront.
 *
 * Generic cookie/id helpers live in `~/lib/pixels`. This file only holds the
 * TikTok-specific payload shapes.
 *
 * `content_id` uses the numeric ProductVariant id, which is what the TikTok
 * for Shopify catalog uses as its SKU id. If these don't match, dynamic
 * product ads and retargeting silently break.
 */

import {
  gidToId,
  readCookie,
  toNumber,
  writeRootCookie,
  type ProductLike,
} from '~/lib/pixels';

export {gidToId, newEventId, readCookie, toNumber} from '~/lib/pixels';

/** How long we hold on to a TikTok click id, in days. Matches TikTok's window. */
const TTCLID_MAX_AGE_DAYS = 30;

export const TTCLID_COOKIE = 'ttclid';

export type TikTokContent = {
  content_id: string;
  content_type: 'product';
  content_name?: string;
  content_category?: string;
  brand?: string;
  price?: number;
  quantity?: number;
};

export type TikTokEventProperties = {
  contents: TikTokContent[];
  content_type: 'product';
  value: number;
  currency: string;
};

/**
 * Pull `ttclid` off the landing URL and persist it at the root domain.
 * Without this the Shopify-hosted checkout has no click id to attach to the
 * purchase, and TikTok cannot attribute the sale to the ad that drove it.
 */
export function captureTtclid(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const fromUrl = new URLSearchParams(window.location.search).get('ttclid');
  if (fromUrl) {
    writeRootCookie(TTCLID_COOKIE, fromUrl, TTCLID_MAX_AGE_DAYS);
    return fromUrl;
  }
  return readCookie(TTCLID_COOKIE);
}

/** Map a Hydrogen analytics product into a TikTok `contents` entry. */
export function toContent(product: ProductLike): TikTokContent {
  const variantId = gidToId(product.variantId);
  const productId = gidToId(product.productId ?? product.id);
  return {
    // Prefer the variant id — that is the catalog SKU id.
    content_id: variantId || productId,
    content_type: 'product',
    content_name: product.title ?? undefined,
    content_category: product.productType ?? undefined,
    brand: product.vendor ?? undefined,
    price: toNumber(product.price),
    quantity: product.quantity ?? 1,
  };
}

/** Build the standard properties block TikTok expects for commerce events. */
export function buildEventProperties(
  products: ProductLike[],
  currency: string,
): TikTokEventProperties {
  const contents = products.map(toContent);
  const value = contents.reduce(
    (sum, content) => sum + (content.price ?? 0) * (content.quantity ?? 1),
    0,
  );
  return {
    contents,
    content_type: 'product',
    value: Number(value.toFixed(2)),
    currency,
  };
}
