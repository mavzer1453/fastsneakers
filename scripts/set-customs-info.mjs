#!/usr/bin/env node
/**
 * Fill in the customs data Shopify needs before it can quote import duties.
 *
 * WHY THIS EXISTS
 * ---------------
 * Settings → Taxes and duties → "Collect duties and import taxes at checkout"
 * cannot calculate anything without two fields on every variant:
 *
 *   • Harmonized System (HS) code — what the item is, in customs terms
 *   • Country of origin           — where it was manufactured
 *
 * As of 3 Sep 2026 the store had those on 0 of 142,885 variants, so turning
 * the setting on would have collected nothing (or the wrong amount) and left
 * US buyers with the surprise courier bill it is meant to prevent.
 *
 * ⚠️  READ BEFORE RUNNING
 * ----------------------
 * An HS code is a customs declaration. Declaring the wrong one means paying
 * the wrong duty, and the liability is the importer's — penalties and seizure
 * are both on the table. The mapping below is a STARTING POINT chosen from
 * product type only; it cannot see upper materials, which is exactly what
 * splits footwear across 6403/6404/6405.
 *
 * Have a customs broker or your supplier confirm these before --apply, and
 * correct COUNTRY_OF_ORIGIN to where the goods are actually made. Do not
 * guess: a false origin declaration is a false customs declaration.
 *
 * Usage:
 *   node scripts/set-customs-info.mjs                      # dry run + CSV report
 *   node scripts/set-customs-info.mjs --origin=VN          # dry run, origin Vietnam
 *   node scripts/set-customs-info.mjs --origin=VN --apply  # write it
 *   node scripts/set-customs-info.mjs --origin=VN --apply --limit=50
 *
 * Flags:
 *   --origin=XX   ISO country code for country of manufacture (required to apply)
 *   --apply       actually write; without it nothing is changed
 *   --limit=N     stop after N products, for a cautious first pass
 *   --hs-only     set HS codes, leave country of origin alone
 */

import {existsSync, readFileSync, writeFileSync} from 'node:fs';

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
const HS_ONLY = process.argv.includes('--hs-only');
const ORIGIN = (
  process.argv.find((a) => a.startsWith('--origin=')) ?? ''
).slice(9).toUpperCase();
const LIMIT = Number.parseInt(
  (process.argv.find((a) => a.startsWith('--limit=')) ?? '').slice(8),
  10,
);
const API_VERSION = '2025-07';

/**
 * productType → 6-digit HS heading.
 *
 * Footwear sits in chapter 64 and splits by UPPER material, which the product
 * type does not record:
 *   6403 — leather uppers
 *   6404 — textile uppers        ← assumed here for "sneakers"
 *   6405 — other
 * 640411 is specifically sports/athletic footwear with textile uppers and
 * rubber or plastic soles, which fits most of this catalogue but is wrong for
 * any leather-upper silhouette (a leather AF1, most Jordans).
 *
 * Apparel sits in chapters 61 (knitted) and 62 (woven) and splits by fibre,
 * which is likewise not recorded. Cotton is assumed.
 */
const HS_BY_TYPE = {
  sneakers: '640411',
  Slippers: '640419',
  Boots: '640391',
  'T-Shirts': '610910',
  Tops: '611020',
  Hoodies: '611020',
  Tracksuits: '611211',
  Sets: '611211',
  Pants: '620342',
  Shorts: '620462',
  Jackets: '620193',
  Accessories: '420292',
  Bags: '420292',
};

if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET in .env');
  process.exit(1);
}
if (APPLY && !HS_ONLY && !/^[A-Z]{2}$/.test(ORIGIN)) {
  console.error(
    'Refusing to apply without --origin=XX (ISO country of manufacture).\n' +
      'Country of origin is a customs declaration — it has to be the real one.\n' +
      'Use --hs-only if you want to set HS codes and handle origin separately.',
  );
  process.exit(1);
}

// ------------------------------------------------------------- admin api ---

const ENDPOINT = `https://${SHOP}.myshopify.com/admin/api/${API_VERSION}/graphql.json`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let token = null;
let tokenExpiresAt = 0;

async function getToken() {
  if (token && Date.now() < tokenExpiresAt - 60_000) return token;
  const res = await fetch(
    `https://${SHOP}.myshopify.com/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    },
  );
  if (!res.ok) throw new Error(`Token request failed: ${res.status}`);
  const json = await res.json();
  token = json.access_token;
  tokenExpiresAt = Date.now() + (json.expires_in ?? 86400) * 1000;
  return token;
}

async function gql(query, variables, attempt = 0) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': await getToken(),
    },
    body: JSON.stringify({query, variables}),
  });
  if (res.status === 429 || res.status >= 500) {
    if (attempt > 5) throw new Error(`Giving up after ${attempt} retries`);
    const wait = Number(res.headers.get('Retry-After') ?? 2) * 1000 || 2000;
    await sleep(wait * (attempt + 1));
    return gql(query, variables, attempt + 1);
  }
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

// ----------------------------------------------------------------- fetch ---

const PRODUCTS = `
  query Products($cursor: String) {
    products(first: 40, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        productType
        variants(first: 100) {
          nodes {
            id
            inventoryItem {
              id
              harmonizedSystemCode
              countryCodeOfOrigin
            }
          }
        }
      }
    }
  }
`;

/**
 * Writes through productVariantsBulkUpdate rather than inventoryItemUpdate,
 * for two reasons:
 *
 *  - Scopes. inventoryItemUpdate needs write_inventory, which this app does
 *    not hold; the bulk mutation rides on write_products, which it does.
 *  - Speed. One call per product instead of one per variant — 9,587 calls
 *    instead of 142,885, which is minutes rather than about five hours.
 *
 * Up to 250 variants can go in a single call.
 */
const UPDATE = `
  mutation BulkCustoms($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id }
      userErrors { field message }
    }
  }
`;

const CHUNK = 250;

async function main() {
  console.log(
    `\nCustoms info  (${APPLY ? 'APPLY' : 'DRY RUN'}${
      HS_ONLY ? ', HS codes only' : `, origin ${ORIGIN || '—'}`
    })\n`,
  );

  let cursor = null;
  let scanned = 0;
  let already = 0;
  let planned = 0;
  let written = 0;
  let failed = 0;
  const unmapped = new Map();
  const rows = [['product', 'type', 'variants', 'hs_code', 'origin']];

  for (;;) {
    const data = await gql(PRODUCTS, {cursor});
    const page = data.products;

    for (const product of page.nodes) {
      if (Number.isFinite(LIMIT) && scanned >= LIMIT) {
        cursor = null;
        break;
      }
      scanned += 1;

      const hs = HS_BY_TYPE[product.productType];
      if (!hs) {
        unmapped.set(
          product.productType || '(none)',
          (unmapped.get(product.productType || '(none)') ?? 0) + 1,
        );
        continue;
      }

      const todo = product.variants.nodes.filter((variant) => {
        const item = variant.inventoryItem;
        const needsHs = item.harmonizedSystemCode !== hs;
        const needsOrigin =
          !HS_ONLY && ORIGIN && item.countryCodeOfOrigin !== ORIGIN;
        return needsHs || needsOrigin;
      });

      if (todo.length === 0) {
        already += 1;
        continue;
      }

      planned += todo.length;
      rows.push([
        product.title,
        product.productType,
        String(todo.length),
        hs,
        HS_ONLY ? '' : ORIGIN,
      ]);

      if (!APPLY) continue;

      const inventoryItem = {harmonizedSystemCode: hs};
      if (!HS_ONLY && ORIGIN) inventoryItem.countryCodeOfOrigin = ORIGIN;

      for (let i = 0; i < todo.length; i += CHUNK) {
        const batch = todo
          .slice(i, i + CHUNK)
          .map((variant) => ({id: variant.id, inventoryItem}));
        try {
          const result = await gql(UPDATE, {
            productId: product.id,
            variants: batch,
          });
          const errors = result.productVariantsBulkUpdate.userErrors;
          if (errors.length) {
            failed += batch.length;
            console.error(`  ✗ ${product.title}: ${errors[0].message}`);
          } else {
            written += batch.length;
          }
        } catch (error) {
          failed += batch.length;
          console.error(`  ✗ ${product.title}: ${error.message}`);
        }
        await sleep(220);
      }
    }

    if (!cursor && Number.isFinite(LIMIT) && scanned >= LIMIT) break;
    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }

  console.log(`  products scanned   : ${scanned}`);
  console.log(`  already correct    : ${already}`);
  console.log(`  variants to change : ${planned}`);
  if (APPLY) {
    console.log(`  variants written   : ${written}`);
    console.log(`  failed             : ${failed}`);
  }
  if (unmapped.size) {
    console.log('\n  product types with no HS mapping (skipped):');
    for (const [type, count] of [...unmapped].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${type.padEnd(24)} ${count}`);
    }
  }

  const csv = rows
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','),
    )
    .join('\n');
  writeFileSync('customs-info-report.csv', csv);
  console.log('\nWrote customs-info-report.csv');
  if (!APPLY) console.log('Dry run — nothing written. Re-run with --apply.\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
