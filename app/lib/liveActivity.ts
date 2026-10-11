/**
 * Shared types for the live-activity popup (`app/components/LiveActivity.tsx`).
 *
 * Kept apart from `liveActivity.server.ts` so the component can import the
 * shape without dragging the Admin API client into the browser bundle.
 *
 * Everything the popup shows is REAL:
 *  - `kind: 'order'` items come from orders actually placed in this shop
 *    (Admin API), never from an invented name/city/timestamp list;
 *  - `kind: 'popular'` items come from Shopify's own BEST_SELLING ranking
 *    and say nothing about any individual shopper.
 *
 * If neither source is available the array is empty and the popup renders
 * nothing — the same rule the rest of this storefront follows for
 * placeholder data (see `app/data/shop.ts`).
 */

export type LiveActivityKind = 'order' | 'popular';

export interface LiveActivityImage {
  url: string;
  altText?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface LiveActivityItem {
  /** Stable key for React — the order id, or the product id for bestsellers. */
  id: string;
  /** Product handle the card links to. */
  handle: string;
  title: string;
  image: LiveActivityImage | null;
  kind: LiveActivityKind;
  /** Buyer's first name, when the order carries one. Orders only. */
  name?: string | null;
  /** 'Munich, DE' — from the order's shipping address. Orders only. */
  place?: string | null;
  /** ISO timestamp the order was placed. Orders only. */
  at?: string | null;
}
