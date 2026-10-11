#!/usr/bin/env node
/**
 * Flat prices for socks and shoelaces.
 *
 *   socks  -> €15.00
 *   laces  -> €7.50
 *
 * Why this needs a script and not a bulk edit in the admin:
 *
 * The catalogue names several SNEAKERS after their laces. "Nike Air Force 1
 * Low Rope Laces Purple Custom" is a €94.95 shoe with sizes 36–46 EU, not a
 * lace, and so are "Nike Dunk Low Starry Laces", "Air Max Plus Lace Toggle",
 * "Yeezy 700 MNVN Laceless" and the Trophy Room Jordan 1 "(W/ Blue Laces)".
 * Sixteen of those rope-lace products are even filed under productType
 * `Accessories`, so neither the title nor the type can be trusted on its own.
 * Selecting on the word "laces" and repricing would have sold ~€600 of
 * sneakers for €7.50 each.
 *
 * The signal that actually separates them is the VARIANT OPTION VALUES:
 *
 *   real laces -> "Default Title", "140CM"
 *   sneakers   -> "36 EU", "42.5 EU", "45 EU"
 *
 * So SHOE_SIZE_RE is the guard, and it is checked before anything else. Any
 * product with a shoe-size variant is skipped and listed in the report as
 * `excluded-shoe-sizes`, however much its title looks like a lace. That also
 * makes this safe to re-run after new products are imported.
 *
 * Socks are unambiguous by comparison — their sizes are ranges ("34-38",
 * "38-42") or "One Size", which SHOE_SIZE_RE does not match.
 *
 * Usage:
 *   node scripts/price-accessories.mjs                  # dry run + report
 *   node scripts/price-accessories.mjs --apply
 *   node scripts/price-accessories.mjs --apply --drafts=false
 *
 * Writes price-accessories-report.csv every run, and on --apply a timestamped
 * rollback CSV holding every variant's previous price. To undo, read the
 * rollback CSV — it is variant id + old price, one row each.
 */

import {existsSync, readFileSync, writeFileSync} from 'node:fs';

import {createAdminClient} from './lib/admin.mjs';

// ---------------------------------------------------------------- config ---

const ENV_PATH = new URL('../.env', import.meta.url);
if (existsSync(ENV_PATH)) {
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    if (!line.includes('=') || line.trimStart().startsWith('#')) continue;
    const i = line.indexOf('=');
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (!value || process.env[key]) continue;
    process.env[key] = value.replace(/^["']|["']$/g, '');
  }
}

const SHOP = (process.env.SHOPIFY_SHOP || process.env.PUBLIC_STORE_DOMAIN || '')
  .trim()
  .replace(/\.myshopify\.com$/, '');
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

const APPLY = process.argv.includes('--apply');
const INCLUDE_DRAFTS = !process.argv.includes('--drafts=false');

const SOCK_PRICE = '15.00';
const LACE_PRICE = '7.50';

if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET in .env');
  process.exit(1);
}

const {gql} = createAdminClient({shop: SHOP, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET});

// ------------------------------------------------------------ classifier ---

/**
 * A variant option value that is a shoe size: "42 EU", "42.5 EU", "35.5",
 * "44". Laces are "Default Title" or a length like "140CM"; sock sizes are
 * ranges like "34-38" or "One Size". Deliberately anchored so "140CM" and
 * "34-38" cannot match.
 */
const SHOE_SIZE_RE = /^\d{2}(\.5)?(\s*eu)?$/i;

const hasShoeSizes = (product) =>
  product.variants.nodes.some((v) =>
    (v.selectedOptions ?? []).some((o) => SHOE_SIZE_RE.test((o.value ?? '').trim())),
  );

const SOCK_RE = /\bsocks?\b/i;
/** "veters" is Dutch for laces; the handles use it even where the title was translated. */
const LACE_RE = /\bveters?\b|\blaces\b|\blace\b/i;

/** null = leave alone. */
function classify(product) {
  if (hasShoeSizes(product)) return null;
  const text = `${product.title} ${product.handle}`;
  if (SOCK_RE.test(text)) return 'socks';
  if (LACE_RE.test(text)) return 'laces';
  return null;
}

// ----------------------------------------------------------------- fetch ---

const QUERY = `
  query Candidates($cursor: String) {
    products(first: 25, after: $cursor, query: "title:*sock* OR title:*veter* OR title:*lace* OR title:*laces*") {
      pageInfo { hasNextPage endCursor }
      nodes {
        id handle title status productType
        variants(first: 25) {
          nodes { id title price selectedOptions { name value } }
        }
      }
    }
  }
`;

async function fetchCandidates() {
  const out = [];
  let cursor = null;
  for (;;) {
    const data = await gql(QUERY, {cursor});
    const page = data.products;
    out.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }
  return out;
}

// ------------------------------------------------------------------ plan ---

const UPDATE = `
  mutation Reprice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      userErrors { field message }
    }
  }
`;

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

async function main() {
  console.log(`\n${APPLY ? 'APPLYING' : 'DRY RUN'} — socks €${SOCK_PRICE}, laces €${LACE_PRICE} on ${SHOP}\n`);

  const products = await fetchCandidates();
  console.log(`  scanned ${products.length} candidate products`);

  const plan = [];
  const excluded = [];

  for (const product of products) {
    const kind = classify(product);
    if (!kind) {
      if (LACE_RE.test(product.title) || SOCK_RE.test(product.title)) {
        excluded.push({
          ...product,
          reason: hasShoeSizes(product) ? 'excluded-shoe-sizes' : 'excluded-no-match',
        });
      }
      continue;
    }
    if (!INCLUDE_DRAFTS && product.status !== 'ACTIVE') continue;

    const target = kind === 'socks' ? SOCK_PRICE : LACE_PRICE;
    const changing = product.variants.nodes.filter((v) => Number(v.price) !== Number(target));
    if (!changing.length) continue;
    plan.push({product, kind, target, changing});
  }

  const variantCount = plan.reduce((n, p) => n + p.changing.length, 0);

  const rows = [['handle', 'title', 'status', 'kind', 'variant_id', 'variant', 'old_price', 'new_price']];
  for (const item of plan) {
    for (const v of item.changing) {
      rows.push([item.product.handle, item.product.title, item.product.status, item.kind, v.id, v.title, v.price, item.target]);
    }
  }
  for (const p of excluded) {
    rows.push([p.handle, p.title, p.status, p.reason, '', '', p.variants.nodes[0]?.price ?? '', '']);
  }
  writeFileSync('price-accessories-report.csv', rows.map((r) => r.map(csvCell).join(',')).join('\n'));

  const socks = plan.filter((p) => p.kind === 'socks');
  const laces = plan.filter((p) => p.kind === 'laces');
  console.log(`  socks    : ${socks.length} products, ${socks.reduce((n, p) => n + p.changing.length, 0)} variants -> €${SOCK_PRICE}`);
  console.log(`  laces    : ${laces.length} products, ${laces.reduce((n, p) => n + p.changing.length, 0)} variants -> €${LACE_PRICE}`);
  console.log(`  excluded : ${excluded.length} (shoe sizes / no match) — see report`);
  console.log('\nWrote price-accessories-report.csv');

  for (const p of excluded.filter((e) => e.reason === 'excluded-shoe-sizes').slice(0, 6)) {
    console.log(`    skipped (sneaker): ${p.title} — €${p.variants.nodes[0]?.price}`);
  }

  if (!APPLY) {
    console.log('\nDry run. Read the report, then re-run with --apply.\n');
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const rollback = [['variant_id', 'handle', 'variant', 'old_price']];
  for (const item of plan) {
    for (const v of item.changing) rollback.push([v.id, item.product.handle, v.title, v.price]);
  }
  const rollbackPath = `price-accessories-rollback-${stamp}.csv`;
  writeFileSync(rollbackPath, rollback.map((r) => r.map(csvCell).join(',')).join('\n'));
  console.log(`Wrote ${rollbackPath}`);

  let done = 0;
  const failures = [];
  for (const item of plan) {
    try {
      const data = await gql(UPDATE, {
        productId: item.product.id,
        variants: item.changing.map((v) => ({id: v.id, price: item.target})),
      });
      const errs = data.productVariantsBulkUpdate.userErrors;
      if (errs.length) failures.push(`${item.product.handle}: ${errs.map((e) => e.message).join('; ')}`);
    } catch (error) {
      failures.push(`${item.product.handle}: ${error.message}`);
    }
    done++;
    process.stdout.write(`\r  repriced ${done}/${plan.length}`);
  }
  process.stdout.write('\n');

  console.log(`\nDone. ${variantCount} variants across ${plan.length} products, ${failures.length} failed.`);
  for (const f of failures.slice(0, 10)) console.log(`  ! ${f}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
