/**
 * 28 Sep 2026 — Merchant Center Misrepresentation clean-up: prices.
 *
 * Owner's decisions:
 *   - No selling price more than 30% below the item's reference price.
 *   - Remove every crossed-out ("compare-at") price. A "was" price must be a
 *     price actually charged in the last 30 days (EU Omnibus); these were
 *     retail/reference prices. A visible sale can come from a real Shopify
 *     discount instead.
 *   - Hype/collab items with no reference price go to a spreadsheet; the
 *     owner fills in the market price and the same 30% rule is applied.
 *
 * STEP 1 — plan (dry run, changes nothing):
 *   node scripts/fix-pricing.mjs
 *     → pricing-plan-<ts>.csv   every variant that would change
 *     → hype-items-<ts>.csv     hype/collab products: fill in `market_price`
 *
 * STEP 2 — apply the plan (raise deep discounts, clear all compare-at):
 *   node scripts/fix-pricing.mjs --apply
 *
 * STEP 3 — after filling in market_price in the hype CSV:
 *   node scripts/fix-pricing.mjs --market=hype-items-<ts>.csv          # dry run
 *   node scripts/fix-pricing.mjs --market=hype-items-<ts>.csv --apply
 *
 * Every --apply writes price-rollback-<ts>.json first (variant id, old price,
 * old compare-at). Prices are only ever RAISED to the floor, never lowered.
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {createAdminClient} from './lib/admin.mjs';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  if (!line.includes('=') || line.trimStart().startsWith('#')) continue;
  const i = line.indexOf('=');
  const key = line.slice(0, i).trim();
  const value = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  if (value && !process.env[key]) process.env[key] = value;
}

const MAX_DISCOUNT = 0.3; // selling price >= 70% of the reference price
const HYPE =
  /travis scott|cactus jack|off-white|supreme|sacai|nocta|fragment|union la|kaws|dior|yeezy|sp5der|denim tears|chrome hearts|bape|palace|kith|corteiz|a ma maniere|j balvin|bad bunny|wales bonner|stussy x|patta|jjjjound|aim[eé] leon dore|stone island|ami paris|jacquemus/i;

const APPLY = process.argv.includes('--apply');
const marketArg = process.argv.find((a) => a.startsWith('--market='));
const MARKET_FILE = marketArg ? marketArg.slice('--market='.length) : null;

const {gql} = createAdminClient({
  shop: (process.env.SHOPIFY_SHOP || process.env.PUBLIC_STORE_DOMAIN).replace(/\.myshopify\.com$/, ''),
  clientId: process.env.SHOPIFY_CLIENT_ID,
  clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
  apiVersion: '2025-07',
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const money = (n) => (Math.round(n * 100) / 100).toFixed(2);
const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// ---- Export every variant (lib/admin.mjs `gql` returns json.data) ----------
async function exportVariants() {
  const start = await gql(`mutation {
    bulkOperationRunQuery(query: """
      { productVariants { edges { node {
          id price compareAtPrice
          product { id handle title vendor status }
      } } } }
    """) { bulkOperation { id } userErrors { message } }
  }`);
  const errs = start.bulkOperationRunQuery?.userErrors;
  if (errs?.length) throw new Error(JSON.stringify(errs));
  const opId = start.bulkOperationRunQuery.bulkOperation.id;
  for (;;) {
    await sleep(5000);
    const s = await gql(
      `query($id: ID!) { node(id: $id) { ... on BulkOperation { status objectCount url errorCode } } }`,
      {id: opId},
    );
    const op = s.node;
    process.stdout.write(`\rexporting variants: ${op.status} ${op.objectCount}   `);
    if (op.status === 'COMPLETED') {
      console.log();
      if (!op.url) return [];
      const text = await (await fetch(op.url)).text();
      return text.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    }
    if (['FAILED', 'CANCELED', 'EXPIRED'].includes(op.status)) {
      throw new Error(`bulk export ${op.status} ${op.errorCode}`);
    }
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',' || c === ';') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

const variants = await exportVariants();
console.log(`${variants.length} variants exported.`);

// ---- Build the change list ------------------------------------------------
/** @type {Map<string, {id:string, price:string, compareAtPrice:string|null, newPrice:string, reason:string, product:any}[]>} */
const plan = new Map();
const add = (v, newPrice, reason) => {
  const pid = v.product.id;
  if (!plan.has(pid)) plan.set(pid, []);
  plan.get(pid).push({...v, newPrice, reason});
};

if (MARKET_FILE) {
  // STEP 3: market prices from the owner's spreadsheet.
  const market = new Map();
  for (const r of parseCsv(readFileSync(MARKET_FILE, 'utf8'))) {
    const m = parseFloat(String(r.market_price).replace(',', '.').replace(/[^\d.]/g, ''));
    if (r.handle && m > 0) market.set(r.handle, m);
  }
  console.log(`${market.size} products have a market_price filled in.`);
  for (const v of variants) {
    const m = market.get(v.product.handle);
    if (!m) continue;
    const floor = m * (1 - MAX_DISCOUNT);
    const price = parseFloat(v.price);
    if (price < floor - 0.005 || v.compareAtPrice != null) {
      add(v, money(Math.max(price, floor)), price < floor ? `raised to 70% of market €${m}` : 'clear compare-at');
    }
  }
} else {
  // STEP 1/2: reference = compare-at price.
  for (const v of variants) {
    if (v.compareAtPrice == null) continue;
    const price = parseFloat(v.price);
    const ref = parseFloat(v.compareAtPrice);
    const floor = ref * (1 - MAX_DISCOUNT);
    if (ref > price && price < floor - 0.005) {
      add(v, money(floor), `raised: was ${Math.round((1 - price / ref) * 100)}% below €${v.compareAtPrice}`);
    } else {
      add(v, v.price, ref <= price ? 'clear compare-at (was ≤ price)' : 'clear compare-at');
    }
  }

  // Hype/collab spreadsheet for the owner (one row per product).
  const hype = new Map();
  for (const v of variants) {
    const p = v.product;
    if (p.status !== 'ACTIVE' || !HYPE.test(`${p.title} ${p.vendor}`)) continue;
    const h = hype.get(p.id) ?? {handle: p.handle, title: p.title, vendor: p.vendor, min: Infinity, max: 0, ref: ''};
    h.min = Math.min(h.min, parseFloat(v.price));
    h.max = Math.max(h.max, parseFloat(v.price));
    if (v.compareAtPrice) h.ref = v.compareAtPrice;
    hype.set(p.id, h);
  }
  const hypeFile = `hype-items-${ts}.csv`;
  writeFileSync(
    hypeFile,
    ['handle,title,vendor,current_min_price,current_max_price,old_was_price,market_price']
      .concat([...hype.values()].sort((a, b) => a.title.localeCompare(b.title)).map((h) =>
        [h.handle, h.title, h.vendor, money(h.min), money(h.max), h.ref, ''].map(csvCell).join(',')))
      .join('\n'),
  );
  console.log(`Hype/collab list: ${hypeFile} (${hype.size} products) — fill in market_price.`);
}

const all = [...plan.values()].flat();
const raised = all.filter((x) => x.newPrice !== x.price);
console.log(`${all.length} variants on ${plan.size} products change: ${raised.length} prices raised, ${all.filter((x) => x.compareAtPrice != null).length} crossed-out prices removed.`);

const planFile = `pricing-plan-${ts}.csv`;
writeFileSync(
  planFile,
  ['handle,title,variant_id,old_price,old_was_price,new_price,reason']
    .concat(all.map((x) => [x.product.handle, x.product.title, x.id, x.price, x.compareAtPrice ?? '', x.newPrice, x.reason].map(csvCell).join(',')))
    .join('\n'),
);
console.log(`Plan: ${planFile}`);

if (!APPLY) {
  console.log('Dry run — nothing changed. Check the plan, then re-run with --apply.');
  process.exit(0);
}

// ---- Apply ----------------------------------------------------------------
const rollbackFile = `price-rollback-${ts}.json`;
writeFileSync(rollbackFile, JSON.stringify(all.map((x) => ({productId: x.product.id, variantId: x.id, price: x.price, compareAtPrice: x.compareAtPrice})), null, 1));
console.log(`Rollback written: ${rollbackFile}`);

let done = 0;
let failed = 0;
for (const [pid, rows] of plan) {
  let ue;
  try {
    const r = await gql(
      `mutation($pid: ID!, $v: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $pid, variants: $v) { userErrors { field message } }
      }`,
      {pid, v: rows.map((x) => ({id: x.id, price: x.newPrice, compareAtPrice: null}))},
    );
    ue = r.productVariantsBulkUpdate?.userErrors;
  } catch (error) {
    ue = [{message: error.message}];
  }
  if (ue?.length) {
    failed++;
    console.error(`\n${pid}: ${JSON.stringify(ue)}`);
  }
  done++;
  if (done % 25 === 0) process.stdout.write(`\r${done}/${plan.size} products`);
}
console.log(`\nDone: ${done - failed} products updated, ${failed} failed.`);
