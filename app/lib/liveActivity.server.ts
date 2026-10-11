import type {Storefront} from '@shopify/hydrogen';

import type {LiveActivityItem} from '~/lib/liveActivity';

/**
 * Data source for the live-activity popup.
 *
 * One source (there used to be two):
 *
 *  1. REAL ORDERS — the shop's own recent orders, read through the Admin API
 *     with the client-credentials token the `scripts/` already use
 *     (SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET). Needs the `read_orders`
 *     scope plus the "Customer name / address" protected-customer-data
 *     approval on that app; without either, the query 403s and the popup
 *     stays empty instead of breaking the page.
 *
 *  2. (removed) Bestseller cards used to pad a quiet order feed. They are
 *     gone: with no readable orders the popup shows nothing.
 *
 * What this module deliberately does NOT do is invent the notifications.
 * Fake "Julia in Munich bought this 3 hours ago" pop-ups are a banned
 * commercial practice in the EU (UCPD/Omnibus — misleading the consumer
 * about other people's purchases), and this shop ships from Belgium, so the
 * popup is wired to real data or it shows nothing at all.
 */

const ADMIN_API_VERSION = '2025-07';

/**
 * How far back an order still counts as "recent". Wide on purpose while the
 * shop is young — six weeks of real orders beats four days of none — and the
 * card always states the true age ("8 days ago"), never a flattering one.
 * Narrow this once the order feed is busy enough to fill a day.
 */
const ORDER_LOOKBACK_DAYS = 45;

/** How many notifications the popup rotates through per page load. */
const MAX_ITEMS = 14;

/** Per-isolate memoisation, so a busy page doesn't re-hit the Admin API. */
const CACHE_TTL_MS = 5 * 60_000;

/**
 * Show the buyer's first name ("Julia in Munich, DE") or just the place
 * ("Someone in Munich, DE"). First name + city is the industry-standard
 * social-proof format, but it is still customer data taken from an order:
 * flip this to `false` if you would rather not surface names at all.
 */
const SHOW_FIRST_NAME = true;

/**
 * Orders that should never appear — your own test purchases, staff orders,
 * anyone who asked not to be shown. Matched on the order's email, lowercased.
 */
const EXCLUDED_EMAILS = new Set<string>(['abdilmavzer53@gmail.com']);

interface Cached {
  at: number;
  items: LiveActivityItem[];
}

const cache = new Map<string, Cached>();

let tokenCache: {token: string; expiresAt: number} | null = null;
let warnedAboutOrders = false;

// ------------------------------------------------------------ admin api ---

interface AdminOrderNode {
  id: string;
  createdAt: string;
  test?: boolean | null;
  email?: string | null;
  customer?: {firstName?: string | null} | null;
  shippingAddress?: {
    firstName?: string | null;
    city?: string | null;
    countryCodeV2?: string | null;
  } | null;
  lineItems: {
    nodes: Array<{
      title: string;
      product?: {
        handle?: string | null;
        title?: string | null;
        featuredImage?: {
          url: string;
          altText?: string | null;
          width?: number | null;
          height?: number | null;
        } | null;
      } | null;
    }>;
  };
}

// No `#graphql` tag on purpose: this is an ADMIN API document, and codegen
// validates every tagged document against the Storefront schema.
const ADMIN_ORDERS_QUERY = `
  query LiveActivityOrders($first: Int!, $query: String!) {
    orders(first: $first, sortKey: CREATED_AT, reverse: true, query: $query) {
      nodes {
        id
        createdAt
        test
        email
        customer { firstName }
        shippingAddress { firstName city countryCodeV2 }
        lineItems(first: 5) {
          nodes {
            title
            product {
              handle
              title
              featuredImage { url altText width height }
            }
          }
        }
      }
    }
  }
`;

/**
 * Admin API token via OAuth client credentials — the same grant
 * `scripts/backfill-identifiers.mjs` uses, so no extra secret to manage.
 * Cached until shortly before it expires.
 */
async function adminToken(env: Env): Promise<string | null> {
  const domain = env.PUBLIC_STORE_DOMAIN;
  const clientId = env.SHOPIFY_CLIENT_ID;
  const clientSecret = env.SHOPIFY_CLIENT_SECRET;
  if (!domain || !clientId || !clientSecret) return null;

  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  const response = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!response.ok) return null;

  const body = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!body.access_token) return null;

  tokenCache = {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  return tokenCache.token;
}

/** First word only: an order's "first name" field is not always just one. */
function firstNameOf(value?: string | null): string | null {
  const name = (value ?? '').trim().split(/\s+/)[0];
  if (!name || name.length < 2 || name.length > 24) return null;
  // Initials-only ("J.") tell the shopper nothing; drop them.
  if (/[.]/.test(name)) return null;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function placeOf(address?: AdminOrderNode['shippingAddress']): string | null {
  const city = (address?.city ?? '').trim();
  if (!city) return null;
  const country = (address?.countryCodeV2 ?? '').trim();
  return country ? `${city}, ${country}` : city;
}

async function ordersActivity(env: Env): Promise<LiveActivityItem[]> {
  const token = await adminToken(env);
  if (!token) return [];

  const since = new Date(
    Date.now() - ORDER_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const response = await fetch(
    `https://${env.PUBLIC_STORE_DOMAIN}/admin/api/${ADMIN_API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({
        query: ADMIN_ORDERS_QUERY,
        variables: {
          first: 40,
          query: `created_at:>'${since}' AND financial_status:paid`,
        },
      }),
    },
  );

  if (!response.ok) {
    if (!warnedAboutOrders) {
      warnedAboutOrders = true;
      console.warn(
        `[live-activity] Admin orders query failed (${response.status}). ` +
          'Grant the app read_orders + protected customer data access to ' +
          'show real purchases; falling back to bestsellers.',
      );
    }
    return [];
  }

  const body = (await response.json()) as {
    data?: {orders?: {nodes?: AdminOrderNode[]}};
    errors?: Array<{message: string}>;
  };

  if (body.errors?.length) {
    if (!warnedAboutOrders) {
      warnedAboutOrders = true;
      console.warn(
        `[live-activity] Admin orders query error: ${body.errors[0].message}`,
      );
    }
    return [];
  }

  const items: LiveActivityItem[] = [];
  const seenHandles = new Set<string>();

  for (const order of body.data?.orders?.nodes ?? []) {
    if (order.test) continue;
    if (order.email && EXCLUDED_EMAILS.has(order.email.toLowerCase())) continue;

    const line = order.lineItems?.nodes?.find((node) => node.product?.handle);
    const handle = line?.product?.handle;
    if (!handle || seenHandles.has(handle)) continue;

    const place = placeOf(order.shippingAddress);
    // No city means no place to name, and "someone, somewhere" is not proof.
    if (!place) continue;

    seenHandles.add(handle);
    items.push({
      id: order.id,
      handle,
      title: line?.product?.title ?? line?.title ?? '',
      image: line?.product?.featuredImage ?? null,
      kind: 'order',
      name: SHOW_FIRST_NAME
        ? firstNameOf(order.customer?.firstName ?? order.shippingAddress?.firstName)
        : null,
      place,
      at: order.createdAt,
    });

    if (items.length >= MAX_ITEMS) break;
  }

  return items;
}

// ---------------------------------------------------------------- entry ---

/**
 * Notifications for the popup. Never rejects: a broken feed means an empty
 * array, which renders nothing at all.
 */
export async function loadLiveActivity({
  env,
  storefront,
}: {
  env: Env;
  storefront: Storefront;
}): Promise<LiveActivityItem[]> {
  const key = `${storefront.i18n?.country ?? 'XX'}-${storefront.i18n?.language ?? 'EN'}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.items;

  let items: LiveActivityItem[] = [];

  try {
    items = await ordersActivity(env);
  } catch (error) {
    console.error('[live-activity] orders', error);
  }

  // Real orders only. The queue used to be topped up with Shopify's
  // bestseller ranking ("Bestseller / Popular right now") whenever there were
  // too few orders to fill it — removed at the owner's request (2026-09-20).
  // No recent orders now simply means no popup.
  cache.set(key, {at: Date.now(), items});
  return items;
}
