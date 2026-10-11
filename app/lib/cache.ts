import type {Storefront} from '@shopify/hydrogen';

/**
 * How long Storefront API answers may be reused between visitors.
 *
 * Why this exists:
 *
 * Every query that named no strategy got Hydrogen's default, CacheShort: one
 * second fresh, nine more stale. For a shopper clicking around that is fine.
 * For Googlebot it is the same as no cache at all — it asks for thousands of
 * DIFFERENT URLs minutes apart, so every page was assembled from scratch, and
 * for a crawler `entry.server` waits for the whole stream (`allReady`) before
 * sending a byte. Measured 2026-09-21: product pages 0.5–1.4 s to first byte,
 * collections up to 2.1 s, the homepage 6 s straight after a deploy. Response
 * time is what Google sizes a site's crawl rate by, and 7,279 URLs were
 * sitting in "Discovered – currently not indexed".
 *
 * Most of what those pages wait for is not about the page at all. The three
 * recommendation rails under a product are keyed by product TYPE, by one of
 * eight sponsor brands and by the product's brand — a few dozen distinct
 * queries serving 9,500 product pages. Cached properly they are always warm,
 * and a cold product page is left waiting on one query instead of four.
 *
 * What is deliberately NOT here:
 *
 *   - The product page's own query. Its price and availability feed the
 *     Product JSON-LD that Merchant Center checks against the feed, and a
 *     long-tail product is cold whatever the strategy says. It keeps the
 *     default.
 *   - Anything per-visitor: cart, customer, wishlist, session. Those never go
 *     through these helpers.
 *   - Whole-page caching. The root loader streams the cart, the login state
 *     and a customer access token into the HTML, so a cached document would
 *     be one visitor's page served to the next. It cannot be switched on
 *     until that data is loaded from the browser instead — a separate job.
 *
 * Both strategies are public and keyed by Hydrogen on the full query,
 * variables and `@inContext` country/language, so markets never share an
 * entry and prices stay in the right currency.
 */

/**
 * Listings a shopper reads prices from: collection grids, the homepage
 * sections, a product's "recommended" strip.
 *
 * Fresh for five minutes; after that a visitor still gets the stored answer
 * instantly while it refreshes in the background, for up to an hour. A price
 * change therefore reaches a busy page within ~5 minutes and any page within
 * the hour.
 */
export function listingCache(storefront: Pick<Storefront, 'CacheCustom'>) {
  return storefront.CacheCustom({
    mode: 'public',
    maxAge: 60 * 5,
    staleWhileRevalidate: 60 * 60,
  });
}

/**
 * The shared rails under every product page ("viewed by others", sponsored
 * brand, more from this brand). Shuffled per request AFTER the fetch, so a
 * long-lived pool costs no variety — and these are the queries that must stay
 * warm for a crawler walking the long tail.
 */
export function railCache(storefront: Pick<Storefront, 'CacheCustom'>) {
  return storefront.CacheCustom({
    mode: 'public',
    maxAge: 60 * 10,
    staleWhileRevalidate: 60 * 60 * 12,
  });
}
