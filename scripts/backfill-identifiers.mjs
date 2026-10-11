#!/usr/bin/env node
/**
 * Fill in the product identifiers Google and Meta match on: GTIN and MPN.
 *
 * Shopify maps them like this:
 *   variant.barcode        -> gtin   (Google), the strongest match signal there is
 *   variant.inventoryItem.sku -> mpn  (Google)
 *   product.vendor         -> brand
 *
 * Without a GTIN, Google can't tie a listing to its catalogue entry, so it
 * loses comparison placement and ranks below sellers who have one. SneakerAsk
 * publishes both, per variant — and because it's the same physical shoe, the
 * correct values for us are the same as theirs. Nothing here is invented: a
 * fabricated GTIN either fails validation or, worse, matches somebody else's
 * product. Where the source has no barcode, the variant is left empty, which
 * is what Google expects for genuinely identifier-less goods.
 *
 * GTINs are per SIZE, so variants are matched size by size, not per product.
 * MPNs (style codes like DH3227-105) are per colourway, so they're the same
 * across every size.
 *
 * Existing values are never overwritten — this only fills blanks.
 *
 * Usage:
 *   node scripts/backfill-identifiers.mjs                # dry run + report
 *   node scripts/backfill-identifiers.mjs --apply
 *   node scripts/backfill-identifiers.mjs --apply --limit=50
 *   node scripts/backfill-identifiers.mjs --skus-only    # leave barcodes alone
 */

import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {URLSearchParams} from 'node:url';

// ---------------------------------------------------------------- config ---

const ENV_PATH = new URL('../.env', import.meta.url);
if (existsSync(ENV_PATH)) {
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    if (!line.includes('=') || line.trimStart().startsWith('#')) continue;
    const i = line.indexOf('=');
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (!value || process.env[key]) continue;
    process.env[key] = value;
  }
}

const SHOP = (process.env.SHOPIFY_SHOP || process.env.PUBLIC_STORE_DOMAIN || '')
  .trim()
  .replace(/\.myshopify\.com$/, '');
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const APPLY = process.argv.includes('--apply');
const SKUS_ONLY = process.argv.includes('--skus-only');
const BARCODES_ONLY = process.argv.includes('--barcodes-only');
const LIMIT = Number.parseInt(
  (process.argv.find((a) => a.startsWith('--limit=')) ?? '').slice(8),
  10,
);
const API_VERSION = '2025-07';
const SOURCE = 'https://sneakerask.com';

if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET in .env');
  process.exit(1);
}

// ------------------------------------------------------------- admin api ---

const ENDPOINT = `https://${SHOP}.myshopify.com/admin/api/${API_VERSION}/graphql.json`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let token = null;
let tokenExpiresAt = 0;

async function getToken() {
  if (token && Date.now() < tokenExpiresAt - 60_000) return token;
  const res = await fetch(`https://${SHOP}.myshopify.com/admin/oauth/access_token`, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`Token request failed (${res.status})`);
  const {access_token, expires_in, scope} = await res.json();
  if (!/write_products/.test(scope ?? '')) {
    throw new Error(`App lacks write_products (granted: ${scope || 'none'})`);
  }
  token = access_token;
  tokenExpiresAt = Date.now() + expires_in * 1000;
  return token;
}

async function admin(query, variables = {}, attempt = 0) {
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'X-Shopify-Access-Token': await getToken()},
      body: JSON.stringify({query, variables}),
    });
  } catch (error) {
    if (attempt >= 6) throw error;
    await sleep(2000 * (attempt + 1));
    return admin(query, variables, attempt + 1);
  }
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 6) throw new Error(`Admin API ${res.status}`);
    await sleep(2000 * (attempt + 1));
    return admin(query, variables, attempt + 1);
  }
  const json = await res.json();
  if (json.errors) {
    if (json.errors.some((e) => e.extensions?.code === 'THROTTLED') && attempt < 6) {
      await sleep(2000 * (attempt + 1));
      return admin(query, variables, attempt + 1);
    }
    throw new Error(`GraphQL: ${JSON.stringify(json.errors).slice(0, 300)}`);
  }
  const throttle = json.extensions?.cost?.throttleStatus;
  if (throttle && throttle.currentlyAvailable < 300) await sleep(1000);
  return json.data;
}

// ------------------------------------------------------------- fetching ---

async function fetchWithRetry(url, attempt = 0) {
  const res = await fetch(url);
  if (res.ok) return res;
  if ((res.status !== 429 && res.status < 500) || attempt >= 6) {
    throw new Error(`sneakerask HTTP ${res.status}`);
  }
  const retryAfter = Number.parseInt(res.headers.get('retry-after') ?? '', 10);
  await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : 2000 * 2 ** attempt);
  return fetchWithRetry(url, attempt + 1);
}

/**
 * Sizes are written inconsistently on both sides ("42 EU", "42", "42 2/3 EU"),
 * so compare them stripped down to the number.
 */
const sizeKey = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/\s*eu\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The list endpoint omits barcodes, so identifiers come from the per-product
 * endpoint. That's one request per product we actually need — the list pass
 * first tells us which those are.
 */
async function fetchSourceIndex() {
  const index = new Map();
  for (let page = 1; page <= 100; page++) {
    if (page > 1) await sleep(600);
    const res = await fetchWithRetry(`${SOURCE}/products.json?limit=250&page=${page}`);
    const {products} = await res.json();
    if (!products.length) break;
    for (const p of products) index.set(p.handle, null);
    process.stdout.write(`\r  sneakerask index: ${index.size}`);
  }
  process.stdout.write('\n');
  return index;
}

async function fetchSourceProduct(handle) {
  const res = await fetch(`${SOURCE}/products/${handle}.json`);
  if (res.status === 429) {
    await sleep(3000);
    return fetchSourceProduct(handle);
  }
  if (!res.ok) return null;
  const {product} = await res.json();
  const bySize = new Map();
  for (const v of product.variants) {
    bySize.set(sizeKey(v.option1 ?? v.title), {sku: v.sku || null, barcode: v.barcode || null});
  }
  return {bySize, fallbackSku: product.variants.find((v) => v.sku)?.sku ?? null};
}

const PRODUCTS_QUERY = `
  query Products($cursor: String) {
    products(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        handle
        variants(first: 100) {
          nodes { id title sku barcode }
        }
      }
    }
  }
`;

async function fetchOwnProducts() {
  const out = [];
  let cursor = null;
  for (;;) {
    const data = await admin(PRODUCTS_QUERY, {cursor});
    out.push(...data.products.nodes);
    process.stdout.write(`\r  our catalogue: ${out.length}`);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }
  process.stdout.write('\n');
  return out;
}

// -------------------------------------------------------------- updating ---

const UPDATE = `
  mutation Identifiers($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      userErrors { field message }
    }
  }
`;

const PRODUCT_ID = `
  query Id($handle: String!) { productByHandle(handle: $handle) { id } }
`;

// ------------------------------------------------------------------ main ---

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

async function main() {
  const mode = SKUS_ONLY ? 'SKUs only' : BARCODES_ONLY ? 'barcodes only' : 'SKUs + barcodes';
  console.log(`\nBackfill identifiers  (${APPLY ? 'APPLY' : 'DRY RUN'}, ${mode})\n`);

  const sourceHandles = await fetchSourceIndex();
  const own = await fetchOwnProducts();

  // Only products that (a) exist at the source and (b) are actually missing
  // something are worth a per-product request.
  const candidates = own.filter((p) => {
    if (!sourceHandles.has(p.handle)) return false;
    return p.variants.nodes.some(
      (v) => (!v.barcode && !SKUS_ONLY) || (!v.sku && !BARCODES_ONLY),
    );
  });

  console.log(`\n  matched at source : ${own.filter((p) => sourceHandles.has(p.handle)).length}`);
  console.log(`  missing something : ${candidates.length}`);

  const batch = Number.isFinite(LIMIT) ? candidates.slice(0, LIMIT) : candidates;
  console.log(`\nReading ${batch.length} products from SneakerAsk (paced)...`);

  const plan = [];
  const stats = {skus: 0, barcodes: 0, noSourceData: 0, sizeMiss: 0};
  let scanned = 0;

  for (const p of batch) {
    const src = await fetchSourceProduct(p.handle);
    scanned++;
    if (scanned % 25 === 0 || scanned === batch.length) {
      process.stdout.write(`\r  read ${scanned}/${batch.length}`);
    }
    if (!src) {
      stats.noSourceData++;
      continue;
    }

    const variants = [];
    for (const v of p.variants.nodes) {
      const match = src.bySize.get(sizeKey(v.title));
      if (!match) {
        stats.sizeMiss++;
        continue;
      }
      const update = {id: v.id};
      let touched = false;

      if (!BARCODES_ONLY && !v.sku) {
        const sku = match.sku || src.fallbackSku;
        if (sku) {
          update.inventoryItem = {sku};
          stats.skus++;
          touched = true;
        }
      }
      if (!SKUS_ONLY && !v.barcode && match.barcode) {
        update.barcode = match.barcode;
        stats.barcodes++;
        touched = true;
      }
      if (touched) variants.push(update);
    }

    if (variants.length) plan.push({handle: p.handle, variants});
    await sleep(350); // stay under SneakerAsk's rate limit
  }
  process.stdout.write('\n');

  console.log(`\n  products to update : ${plan.length}`);
  console.log(`  SKUs to fill       : ${stats.skus}`);
  console.log(`  barcodes to fill   : ${stats.barcodes}`);
  console.log(`  sizes with no match: ${stats.sizeMiss}`);
  if (stats.noSourceData) console.log(`  source read failed : ${stats.noSourceData}`);

  const report = [
    ['handle', 'variants_updated', 'skus', 'barcodes'].join(','),
    ...plan.map((x) =>
      [
        x.handle,
        x.variants.length,
        x.variants.filter((v) => v.inventoryItem?.sku).length,
        x.variants.filter((v) => v.barcode).length,
      ]
        .map(csvCell)
        .join(','),
    ),
  ].join('\n');
  writeFileSync(new URL('../backfill-identifiers-report.csv', import.meta.url), report + '\n');
  console.log('\nWrote backfill-identifiers-report.csv');

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply.\n');
    return;
  }

  console.log('\nApplying...');
  const failures = [];
  let done = 0;

  for (const item of plan) {
    try {
      const {productByHandle} = await admin(PRODUCT_ID, {handle: item.handle});
      if (!productByHandle) {
        failures.push(`${item.handle}: product not found`);
        continue;
      }
      const data = await admin(UPDATE, {
        productId: productByHandle.id,
        variants: item.variants,
      });
      const errs = data.productVariantsBulkUpdate.userErrors;
      if (errs.length) failures.push(`${item.handle}: ${errs.map((e) => e.message).join('; ')}`);
    } catch (error) {
      failures.push(`${item.handle}: ${error.message}`);
    }
    done++;
    if (done % 20 === 0 || done === plan.length) {
      process.stdout.write(`\r  updated ${done}/${plan.length}  (${failures.length} failed)`);
    }
  }
  process.stdout.write('\n');

  if (failures.length) {
    console.log(`\n${failures.length} failed:`);
    for (const f of failures.slice(0, 20)) console.log(`  ${f}`);
    process.exitCode = 1;
  } else {
    console.log('\nDone.\n');
  }
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
