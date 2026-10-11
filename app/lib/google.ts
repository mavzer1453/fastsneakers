/**
 * Google Analytics 4 mapping for the Hydrogen storefront.
 *
 * Generic cookie/id helpers live in `~/lib/pixels`. This file only holds the
 * GA4-specific payload shapes.
 *
 * `item_id` uses the numeric ProductVariant id, matching what `toContent` in
 * `~/lib/tiktok` and `buildEventProperties` in `~/lib/meta` send. Note that
 * the Google & YouTube channel submits feed ids to Merchant Center as
 * `shopify_<COUNTRY>_<productId>_<variantId>`, so GA4's automatic
 * "merchandise" join against the feed will not line up on the bare variant
 * id. That join is a reporting nicety; keeping one id scheme across all three
 * pixels is worth more than the join, and Google Ads conversions key off the
 * event, not the item id.
 */

import {gidToId, toNumber, type ProductLike} from '~/lib/pixels';

export {gidToId, newEventId, toNumber} from '~/lib/pixels';

/** One entry in a GA4 `items` array. */
export type Ga4Item = {
  item_id: string;
  item_name?: string;
  item_brand?: string;
  item_category?: string;
  item_variant?: string;
  price?: number;
  quantity?: number;
};

/** The standard commerce payload GA4 expects alongside `items`. */
export type Ga4EventProperties = {
  currency: string;
  value: number;
  items: Ga4Item[];
};

/** Map a Hydrogen analytics product into a GA4 `items` entry. */
export function toItem(product: ProductLike): Ga4Item {
  const variantId = gidToId(product.variantId);
  const productId = gidToId(product.productId ?? product.id);
  return {
    item_id: variantId || productId,
    item_name: product.title ?? undefined,
    item_brand: product.vendor ?? undefined,
    item_category: product.productType ?? undefined,
    item_variant: product.variantTitle ?? undefined,
    price: toNumber(product.price),
    quantity: product.quantity ?? 1,
  };
}

/** Build the standard properties block GA4 expects for commerce events. */
export function buildEventProperties(
  products: ProductLike[],
  currency: string,
): Ga4EventProperties {
  const items = products.map(toItem);
  const value = items.reduce(
    (sum, item) => sum + (item.price ?? 0) * (item.quantity ?? 1),
    0,
  );
  return {
    currency,
    value: Number(value.toFixed(2)),
    items,
  };
}
