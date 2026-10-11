#!/usr/bin/env node
/**
 * Reprice every sneaker against SneakerAsk.
 *
 * Rules (first match wins):
 *   1. Travis Scott / Cactus Jack sneakers        -> SKIPPED (see price-from-sneakerask.mjs)
 *   2. ASICS GEL-NYC and GEL-KAYANO sneakers      -> SKIPPED (see price-from-sneakerask.mjs)
 *   3. Everything else in the sneaker catalogue   -> SneakerAsk price − €10
 *
 * Details:
 *   - SneakerAsk prices each size differently. We take their LOWEST non-zero
 *     variant price for the product and apply one flat price to every size,
 *     matching product-for-product on the Shopify handle (both stores share
 *     the same handles).
 *   - Rule 3 never LOWERS a price: if sneakerask − 10 is not above the
 *     product's current highest variant price, the product is skipped.
 *   - Rules 1 and 2 are absolute — they apply even if that lowers the price.
 *   - Products with no SneakerAsk match are left alone (rule 3 only).
 *   - Only products whose type is sneakers / boots / slippers are touched.
 *     Travis Scott tees, jerseys and shoelaces are NOT repriced.
 *
 * Setup (Shopify Dev Dashboard — legacy custom apps were removed Jan 2026):
 *   1. dev.shopify.com/dashboard -> your app -> create a version with the
 *      Admin API scopes `read_products` and `write_products` -> Release.
 *   2. Install the app on the store.
 *   3. App -> Settings -> copy the Client ID and Client secret into .env:
 *        SHOPIFY_SHOP=vespera-collective
 *        SHOPIFY_CLIENT_ID=...
 *        SHOPIFY_CLIENT_SECRET=...
 *      (.env is gitignored. The script exchanges these for a 24h access token
 *      itself — there is no long-lived token to copy around any more.)
 *
 * Usage:
 *   Dry run (writes nothing, produces reprice-report.csv):
 *     node scripts/reprice-sneakers.mjs
 *   Apply for real:
 *     node scripts/reprice-sneakers.mjs --apply
 *
 * Undo:
 *   Every --apply first saves reprice-rollback-<timestamp>.csv holding the prices
 *   as they were immediately before the change. To put them back:
 *     node scripts/reprice-sneakers.mjs --revert            # preview
 *     node scripts/reprice-sneakers.mjs --revert --apply    # restore
 *   Uses the newest snapshot by default; pick another with --file=name.csv.
 *   Keep those snapshots — they are the only record of the previous prices.
 *
 * An older-style SHOPIFY_ADMIN_TOKEN in the environment is still honoured and
 * skips the exchange.
 *
 * Re-run it any time SneakerAsk moves their prices.
 */

import {copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';

// ---------------------------------------------------------------- config ---

/** Load .env (real environment variables win), same convention as the other scripts. */
const ENV_PATH = new URL('../.env', import.meta.url);
if (existsSync(ENV_PATH)) {
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    if (!line.includes('=') || line.trimStart().startsWith('#')) continue;
    const i = line.indexOf('=');
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    // Skip blanks so a leftover empty placeholder can't shadow a real value
    // set further down the file or in the real environment.
    if (!value || process.env[key]) continue;
    process.env[key] = value;
  }
}

/**
 * Store subdomain. Accepts "my-store" or "my-store.myshopify.com"; falls back to
 * PUBLIC_STORE_DOMAIN, which .env already carries for the Hydrogen storefront.
 */
const SHOP = (process.env.SHOPIFY_SHOP || process.env.PUBLIC_STORE_DOMAIN || '')
  .trim()
  .replace(/\.myshopify\.com$/, '');
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const STATIC_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const APPLY = process.argv.includes('--apply');
const REVERT = process.argv.includes('--revert');
const API_VERSION = '2025-07';

const SOURCE = 'https://sneakerask.com';
const UNDERCUT = 10; // euros below sneakerask
const TRAVIS_PRICE = '139.99';
const GEL_PRICE = '109.99';

/** Product types we treat as "sneakers" (this is the store's Sneakers collection). */
const SNEAKER_TYPES = new Set(['sneakers', 'boots', 'slippers']);

const TRAVIS_RE = /travis scott|cactus jack/;
const GEL_RE = /gel nyc|gel kayano/;

/** Lowercase, strip hyphens/underscores, collapse spaces — so "GEL-NYC" matches "gel nyc". */
const norm = (s) =>
  (s ?? '')
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

if (!SHOP || (!STATIC_TOKEN && !(CLIENT_ID && CLIENT_SECRET))) {
  console.error(
    'Missing credentials. Add these two lines to .env:\n' +
      '  SHOPIFY_CLIENT_ID=...\n' +
      '  SHOPIFY_CLIENT_SECRET=...\n' +
      '(from dev.shopify.com -> your app -> Settings)' +
      (SHOP ? `\nStore resolved as: ${SHOP}.myshopify.com` : '\nAlso set SHOPIFY_SHOP.'),
  );
  process.exit(1);
}

// ------------------------------------------------------------- admin api ---

const ENDPOINT = `https://${SHOP}.myshopify.com/admin/api/${API_VERSION}/graphql.json`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Client credentials grant. Tokens last 24h, so cache and refresh before expiry. */
let cachedToken = STATIC_TOKEN ?? null;
let tokenExpiresAt = STATIC_TOKEN ? Infinity : 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;

  const res = await fetch(`https://${SHOP}.myshopify.com/admin/oauth/access_token`, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Token request failed (${res.status}): ${(await res.text()).slice(0, 300)}`,
    );
  }

  const {access_token, expires_in, scope} = await res.json();
  if (!/write_products/.test(scope ?? '')) {
    throw new Error(
      `App is missing the write_products scope (granted: ${scope || 'none'}). ` +
        'Add it to a new version in the Dev Dashboard, release it, and approve it on the store.',
    );
  }

  cachedToken = access_token;
  tokenExpiresAt = Date.now() + expires_in * 1000;
  return cachedToken;
}

async function admin(query, variables = {}, attempt = 0) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': await getToken(),
    },
    body: JSON.stringify({query, variables}),
  });

  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 6) throw new Error(`Admin API ${res.status} after retries`);
    await sleep(2000 * (attempt + 1));
    return admin(query, variables, attempt + 1);
  }

  const json = await res.json();

  if (json.errors) {
    const throttled = json.errors.some((e) => e.extensions?.code === 'THROTTLED');
    if (throttled && attempt < 6) {
      await sleep(2000 * (attempt + 1));
      return admin(query, variables, attempt + 1);
    }
    throw new Error(`GraphQL: ${JSON.stringify(json.errors).slice(0, 400)}`);
  }

  // Stay polite with the leaky bucket.
  const status = json.extensions?.cost?.throttleStatus;
  if (status && status.currentlyAvailable < 300) {
    await sleep(1000);
  }

  return json.data;
}

// ------------------------------------------------------- 1. sneakerask ----

/** SneakerAsk rate-limits bulk paging, so back off and retry rather than dying. */
async function fetchWithRetry(url, attempt = 0) {
  const res = await fetch(url);
  if (res.ok) return res;

  const retryable = res.status === 429 || res.status >= 500;
  if (!retryable || attempt >= 6) {
    throw new Error(`sneakerask HTTP ${res.status} for ${url}`);
  }

  const retryAfter = Number.parseInt(res.headers.get('retry-after') ?? '', 10);
  const waitMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : 2000 * 2 ** attempt;
  process.stdout.write(`\r  sneakerask: rate limited, waiting ${Math.round(waitMs / 1000)}s...   `);
  await sleep(waitMs);
  return fetchWithRetry(url, attempt + 1);
}

/** handle -> lowest non-zero variant price (a Number) */
async function fetchSneakerAsk() {
  const map = new Map();
  for (let page = 1; page <= 100; page++) {
    if (page > 1) await sleep(600); // pace the crawl so we don't trip the limiter
    const res = await fetchWithRetry(`${SOURCE}/products.json?limit=250&page=${page}`);
    const {products} = await res.json();
    if (!products?.length) break;
    for (const p of products) {
      const prices = p.variants
        .map((v) => Number.parseFloat(v.price))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (prices.length) map.set(p.handle, Math.min(...prices));
    }
    process.stdout.write(`\r  sneakerask: ${map.size} products`);
  }
  process.stdout.write('\n');
  return map;
}

// ------------------------------------------------------ 2. own catalogue --

const PRODUCTS_QUERY = `
  query Products($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        title
        productType
        variants(first: 250) { nodes { id price } }
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
    process.stdout.write(`\r  vespera: ${out.length} products`);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }
  process.stdout.write('\n');
  return out;
}

// ------------------------------------------------------------- 3. plan ----

function buildPlan(products, sneakerAsk) {
  const plan = [];
  const skipped = {notSneaker: 0, noMatch: [], notHigher: [], alreadyRight: 0};

  for (const p of products) {
    if (!SNEAKER_TYPES.has((p.productType ?? '').toLowerCase().trim())) {
      skipped.notSneaker++;
      continue;
    }

    const variants = p.variants.nodes;
    if (!variants.length) continue;

    const current = variants.map((v) => Number.parseFloat(v.price));
    const highestCurrent = Math.max(...current);
    const title = norm(p.title);

    let price = null;
    let rule = null;

    // 28 Sep 2026 (owner): the flat Travis Scott / GEL rules are retired —
    // those products are priced exactly at SneakerAsk, per size, by
    // scripts/price-from-sneakerask.mjs. Skip them here so this script can
    // never flatten them back to one cheap price.
    if (TRAVIS_RE.test(title) || GEL_RE.test(title)) {
      skipped.alreadyRight++;
      continue;
    } else {
      const ref = sneakerAsk.get(p.handle);
      if (ref == null) {
        skipped.noMatch.push(p.handle);
        continue;
      }
      const candidate = Math.round((ref - UNDERCUT) * 100) / 100;
      if (!(candidate > highestCurrent)) {
        skipped.notHigher.push(`${p.handle} (${highestCurrent} -> ${candidate})`);
        continue;
      }
      price = candidate;
      rule = 'sneakerask';
    }

    const fixed = price.toFixed(2);
    if (current.every((c) => c.toFixed(2) === fixed)) {
      skipped.alreadyRight++;
      continue;
    }

    plan.push({
      id: p.id,
      handle: p.handle,
      title: p.title,
      rule,
      from: highestCurrent.toFixed(2),
      to: fixed,
      variantIds: variants.map((v) => v.id),
    });
  }

  return {plan, skipped};
}

// ------------------------------------------------------------ 4. apply ----

const UPDATE = `
  mutation Reprice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      userErrors { field message }
    }
  }
`;

async function apply(plan) {
  let done = 0;
  const failures = [];

  for (const item of plan) {
    try {
      const data = await admin(UPDATE, {
        productId: item.id,
        variants: item.variantIds.map((id) => ({id, price: item.to})),
      });
      const errs = data.productVariantsBulkUpdate.userErrors;
      if (errs.length) failures.push(`${item.handle}: ${errs.map((e) => e.message).join('; ')}`);
    } catch (error) {
      failures.push(`${item.handle}: ${error.message}`);
    }
    done++;
    if (done % 10 === 0 || done === plan.length) {
      process.stdout.write(`\r  updated ${done}/${plan.length}`);
    }
  }

  process.stdout.write('\n');
  return failures;
}

// ------------------------------------------------------------ 5. revert ---

const csvCell = (v) => `"${String(v).replace(/"/g, '""')}"`;

/** Minimal parser for the quoted CSV this script writes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') (cell += '"'), i++;
        else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') (row.push(cell), (cell = ''));
    else if (c === '\n') (row.push(cell), rows.push(row), (row = []), (cell = ''));
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) (row.push(cell), rows.push(row));

  const [header, ...body] = rows.filter((r) => r.length > 1);
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

/** Newest reprice-rollback-*.csv, or a path passed as --file=... */
function rollbackPath() {
  const explicit = process.argv.find((a) => a.startsWith('--file='));
  if (explicit) return new URL(explicit.slice('--file='.length), `file://${process.cwd()}/`);

  const dir = new URL('../', import.meta.url);
  const files = readdirSync(dir)
    .filter((f) => /^reprice-rollback-.*\.csv$/.test(f))
    .sort();
  if (!files.length) return null;
  return new URL(files[files.length - 1], dir);
}

async function revert() {
  const path = rollbackPath();
  if (!path || !existsSync(path)) {
    console.error(
      'No rollback file found. Expected reprice-rollback-<timestamp>.csv in the project root,\n' +
        'or pass one explicitly with --file=path/to/file.csv',
    );
    process.exit(1);
  }

  console.log(`Reading ${decodeURIComponent(path.pathname.split('/').pop())}`);
  const rows = parseCsv(readFileSync(path, 'utf8'));
  const wanted = new Map(rows.map((r) => [r.handle, r.current_price]));

  const products = await fetchOwnProducts();
  const byHandle = new Map(products.map((p) => [p.handle, p]));

  const plan = [];
  const missing = [];
  let alreadyBack = 0;

  for (const [handle, oldPrice] of wanted) {
    const p = byHandle.get(handle);
    if (!p) {
      missing.push(handle);
      continue;
    }
    const variants = p.variants.nodes;
    if (variants.every((v) => Number.parseFloat(v.price).toFixed(2) === oldPrice)) {
      alreadyBack++;
      continue;
    }
    plan.push({
      id: p.id,
      handle,
      to: oldPrice,
      variantIds: variants.map((v) => v.id),
    });
  }

  console.log(`\n  products to restore : ${plan.length}`);
  console.log(`  already back        : ${alreadyBack}`);
  console.log(`  not found in store  : ${missing.length}`);

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --revert --apply to restore.\n');
    return;
  }

  console.log('\nRestoring...');
  const failures = await apply(plan);
  if (failures.length) {
    console.log(`\n${failures.length} product(s) failed:`);
    for (const f of failures) console.log(`  ${f}`);
    process.exitCode = 1;
  } else {
    console.log('\nPrices restored.\n');
  }
}

// -------------------------------------------------------------- 6. main ---

async function main() {
  if (REVERT) {
    console.log(`\nRestore previous sneaker prices  (${APPLY ? 'APPLY' : 'DRY RUN'})\n`);
    return revert();
  }

  console.log(`\nReprice sneakers vs SneakerAsk  (${APPLY ? 'APPLY' : 'DRY RUN'})\n`);

  const sneakerAsk = await fetchSneakerAsk();
  const products = await fetchOwnProducts();
  const {plan, skipped} = buildPlan(products, sneakerAsk);

  const byRule = plan.reduce((acc, x) => ((acc[x.rule] = (acc[x.rule] ?? 0) + 1), acc), {});
  const variantCount = plan.reduce((n, x) => n + x.variantIds.length, 0);

  console.log('\nPlan');
  console.log(`  Travis Scott -> €${TRAVIS_PRICE} : ${byRule['travis-scott'] ?? 0}`);
  console.log(`  GEL NYC / KAYANO -> €${GEL_PRICE} : ${byRule.gel ?? 0}`);
  console.log(`  SneakerAsk − €${UNDERCUT}          : ${byRule.sneakerask ?? 0}`);
  console.log(`  ------------------------------------`);
  console.log(`  products to change            : ${plan.length}`);
  console.log(`  variants to change            : ${variantCount}`);
  console.log('\nSkipped');
  console.log(`  not a sneaker                : ${skipped.notSneaker}`);
  console.log(`  already at target price      : ${skipped.alreadyRight}`);
  console.log(`  no SneakerAsk match          : ${skipped.noMatch.length}`);
  console.log(`  would have lowered the price : ${skipped.notHigher.length}`);

  const report = [
    ['handle', 'title', 'rule', 'current_price', 'new_price', 'variants'].join(','),
    ...plan.map((x) =>
      [x.handle, x.title, x.rule, x.from, x.to, x.variantIds.length].map(csvCell).join(','),
    ),
  ].join('\n');
  writeFileSync(new URL('../reprice-report.csv', import.meta.url), report + '\n');
  console.log('\nWrote reprice-report.csv');

  if (skipped.noMatch.length) {
    console.log(`\nNo SneakerAsk match (left untouched):`);
    for (const h of skipped.noMatch) console.log(`  ${h}`);
  }

  if (!APPLY) {
    console.log('\nDry run — nothing was written. Re-run with --apply to push these prices.\n');
    return;
  }

  // Snapshot the pre-change prices under a name no later dry run will overwrite,
  // so --revert always has something truthful to restore from.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const rollback = `reprice-rollback-${stamp}.csv`;
  copyFileSync(
    new URL('../reprice-report.csv', import.meta.url),
    new URL(`../${rollback}`, import.meta.url),
  );
  console.log(`Saved rollback snapshot: ${rollback}`);

  console.log('\nApplying...');
  const failures = await apply(plan);

  if (failures.length) {
    console.log(`\n${failures.length} product(s) failed:`);
    for (const f of failures) console.log(`  ${f}`);
    process.exitCode = 1;
  } else {
    console.log('\nAll prices updated.\n');
  }
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
