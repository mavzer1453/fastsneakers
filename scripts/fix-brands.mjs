#!/usr/bin/env node
/**
 * Rewrite the `vendor` field on every product from the legacy "EasyHairKit"
 * placeholder to the real brand, derived from the product title.
 *
 * Why: the storefront's Brand filter (collection sidebar) is powered by the
 * Storefront API vendor facet — it only becomes useful once vendors hold
 * real brand names. The storefront already hides/maps the placeholder, but
 * fixing the data unlocks true brand filtering like Zalando.
 *
 * Usage:
 *   1. In Shopify admin: Settings → Apps and sales channels → Develop apps
 *      → Create app → give it the `read_products` + `write_products` Admin
 *      API scopes → install → copy the Admin API access token.
 *   2. Run a dry run (nothing is written, prints what would change):
 *        SHOPIFY_SHOP=fastsneakers.myshopify.com \
 *        SHOPIFY_ADMIN_TOKEN=shpat_xxx \
 *        node scripts/fix-brands.mjs
 *   3. Apply for real:
 *        SHOPIFY_SHOP=... SHOPIFY_ADMIN_TOKEN=... node scripts/fix-brands.mjs --apply
 */

const SHOP = process.env.SHOPIFY_SHOP;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const APPLY = process.argv.includes('--apply');
const API_VERSION = '2025-07';

if (!SHOP || !TOKEN) {
  console.error(
    'Set SHOPIFY_SHOP (e.g. fastsneakers.myshopify.com) and SHOPIFY_ADMIN_TOKEN.',
  );
  process.exit(1);
}

/** Ordered rules — first match wins. Keep collab rules above base brands. */
const BRAND_RULES = [
  [/jumpman|air jordan|\bjordan\b/i, 'Jordan'],
  [/yeezy/i, 'Yeezy'],
  [
    /\bnike\b|\bdunk\b|air force|air max|vomero|vaporwaffle|phantom|total 90|\bkobe\b|p-6000|blazer|cortez\b/i,
    'Nike',
  ],
  [/new balance|\b9060\b|\b550\b|\b530\b|\b1906\b|\b2002r\b/i, 'New Balance'],
  [/asics|gel-/i, 'ASICS'],
  [/adidas|samba|spezial|gazelle|campus 00|handball/i, 'adidas'],
  [/\bugg\b/i, 'UGG'],
  [/travis scott|cactus jack|astroworld|utopia/i, 'Travis Scott'],
  [/stussy/i, 'Stussy'],
  [/corteiz|crtz/i, 'Corteiz'],
  [/gallery/i, 'Gallery Dept'],
  [/essentials|fear of god/i, 'Essentials'],
  [/syna/i, 'Syna World'],
  [/represent/i, 'Represent'],
  [/denim tears|denim trs/i, 'Denim Tears'],
  [/sp5der|spyder/i, 'Sp5der'],
  [/jacquemus/i, 'Jacquemus'],
  [/ralph lauren|\bpolo\b|big pony/i, 'Polo Ralph Lauren'],
  [/\bami\b/i, 'AMI Paris'],
  [/salomon/i, 'Salomon'],
  [/converse|chuck taylor/i, 'Converse'],
  [/\bvans\b/i, 'Vans'],
  [/\bpuma\b/i, 'Puma'],
  [/timberland/i, 'Timberland'],
  [/crocs/i, 'Crocs'],
  [/lacoste/i, 'Lacoste'],
  [/moncler/i, 'Moncler'],
  [/north face|\btnf\b/i, 'The North Face'],
  [/carhartt/i, 'Carhartt'],
];

const HOUSE_BRAND = 'Fast Sneakers';
const LEGACY_VENDORS = new Set(['easyhairkit', 'vitalex', '']);

function brandFor(title) {
  for (const [pattern, brand] of BRAND_RULES) {
    if (pattern.test(title)) return brand;
  }
  return HOUSE_BRAND;
}

async function adminGraphql(query, variables) {
  const response = await fetch(
    `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': TOKEN,
      },
      body: JSON.stringify({query, variables}),
    },
  );
  const json = await response.json();
  if (json.errors) {
    const throttled = json.errors.some(
      (error) => error.extensions?.code === 'THROTTLED',
    );
    if (throttled) return {throttled: true};
    throw new Error(JSON.stringify(json.errors));
  }
  return {data: json.data};
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchAllProducts() {
  const products = [];
  let cursor = null;
  for (;;) {
    const {data} = await adminGraphql(
      `query All($after: String) {
        products(first: 250, after: $after) {
          edges { cursor node { id title vendor } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      {after: cursor},
    );
    const connection = data.products;
    for (const edge of connection.edges) products.push(edge.node);
    process.stdout.write(`\rFetched ${products.length} products…`);
    if (!connection.pageInfo.hasNextPage) break;
    cursor = connection.pageInfo.endCursor;
  }
  console.log('');
  return products;
}

async function updateBatch(batch) {
  const aliases = batch
    .map(
      (item, index) =>
        `u${index}: productUpdate(product: {id: "${item.id}", vendor: ${JSON.stringify(
          item.brand,
        )}}) { userErrors { field message } }`,
    )
    .join('\n');
  for (;;) {
    const result = await adminGraphql(`mutation {\n${aliases}\n}`);
    if (result.throttled) {
      await sleep(4000);
      continue;
    }
    const errors = Object.values(result.data ?? {}).flatMap(
      (entry) => entry?.userErrors ?? [],
    );
    if (errors.length > 0) {
      console.error('User errors:', JSON.stringify(errors, null, 2));
    }
    return;
  }
}

const products = await fetchAllProducts();

const changes = [];
const summary = new Map();
for (const product of products) {
  if (!LEGACY_VENDORS.has((product.vendor ?? '').trim().toLowerCase()))
    continue; // already a real brand — leave it alone
  const brand = brandFor(product.title);
  changes.push({id: product.id, brand});
  summary.set(brand, (summary.get(brand) ?? 0) + 1);
}

console.log(`\n${changes.length} of ${products.length} products need a brand:`);
for (const [brand, count] of [...summary.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(5)}  ${brand}`);
}

if (!APPLY) {
  console.log('\nDry run — nothing written. Re-run with --apply to update.');
  process.exit(0);
}

console.log('\nApplying…');
const BATCH = 20;
for (let index = 0; index < changes.length; index += BATCH) {
  await updateBatch(changes.slice(index, index + BATCH));
  process.stdout.write(
    `\rUpdated ${Math.min(index + BATCH, changes.length)}/${changes.length}`,
  );
  await sleep(600); // stay well under the API cost limit
}
console.log('\nDone. The Brand filter on collection pages is now live.');
