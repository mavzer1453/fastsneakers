#!/usr/bin/env node
/**
 * 28 Sep 2026: every price ends in .95 (owner's choice).
 *
 * Rule: each price moves to the NEAREST x.95 (€187.43 → €186.95,
 * €187.80 → €187.95), so no price moves by more than 50 cents.
 * Prices that already end in .95 are left alone.
 *
 * Crossed-out (compare-at) prices are NEVER changed. They are the real
 * earlier price (EU Omnibus rule), so rounding them would misstate history.
 * The new price has to stay below every crossed-out price on the product
 * and at most 30% below it. If the nearest .95 breaks that, the other
 * neighbouring .95 is used; if neither fits, the product is skipped and
 * marked CHECK in the report.
 *
 * Works per product, so every size keeps the same price.
 * Active and draft products; archived ones are skipped. Only prices change.
 *
 *   node scripts/round-prices.mjs            # dry run → round-prices-<ts>-report.csv
 *   node scripts/round-prices.mjs --apply    # writes round-prices-rollback-<ts>.json first
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
const APPLY = process.argv.includes('--apply');
const MAX_DISCOUNT = 0.3;

const {gql} = createAdminClient({
  shop: (process.env.SHOPIFY_SHOP || process.env.PUBLIC_STORE_DOMAIN).replace(/\.myshopify\.com$/, ''),
  clientId: process.env.SHOPIFY_CLIENT_ID,
  clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
  apiVersion: '2025-07',
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const cents = (n) => Math.round(Number(n) * 100);
const eur = (c) => (c / 100).toFixed(2);
const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Nearest x.95 below and above (in cents). */
function neighbours(c) {
  const down = Math.floor((c + 5) / 100) * 100 - 5; // highest x.95 <= c
  return {down, up: down + 100};
}
/** Pick the .95 price for `c`, respecting the crossed-out prices. */
function target(c, compareAts) {
  if (c % 100 === 95) return {price: c, note: 'already .95'};
  const {down, up} = neighbours(c);
  const nearest = c - down <= up - c ? [down, up] : [up, down];
  const ok = (p) => p > 0 && compareAts.every((w) => p < w && p >= Math.ceil(w * (1 - MAX_DISCOUNT)));
  for (const p of nearest) if (ok(p)) return {price: p, note: p === nearest[0] ? 'nearest .95' : 'other .95 (keeps crossed-out price valid)'};
  return {price: null, note: 'CHECK: no .95 price fits the crossed-out price, skipped'};
}

// ---- 1. Export variants ----------------------------------------------------------------
const start = await gql(`mutation {
  bulkOperationRunQuery(query: """
    { productVariants { edges { node {
        id price compareAtPrice product { id handle title status }
    } } } }
  """) { bulkOperation { id } userErrors { message } }
}`);
if (start.bulkOperationRunQuery?.userErrors?.length) throw new Error(JSON.stringify(start.bulkOperationRunQuery.userErrors));
const opId = start.bulkOperationRunQuery.bulkOperation.id;
let url;
for (;;) {
  await sleep(5000);
  const s = await gql(
    `query($id: ID!) { node(id: $id) { ... on BulkOperation { status objectCount url errorCode } } }`,
    {id: opId},
  );
  process.stdout.write(`\r  exporting variants: ${s.node.status} ${s.node.objectCount}   `);
  if (s.node.status === 'COMPLETED') { url = s.node.url; break; }
  if (['FAILED', 'CANCELED', 'EXPIRED'].includes(s.node.status)) throw new Error(s.node.errorCode);
}
console.log();
const products = new Map();
if (url) {
  for (const l of (await (await fetch(url)).text()).trim().split('\n').filter(Boolean)) {
    const v = JSON.parse(l);
    if (v.product.status === 'ARCHIVED') continue;
    if (!products.has(v.product.id)) products.set(v.product.id, {...v.product, variants: []});
    products.get(v.product.id).variants.push(v);
  }
}
console.log(`  ${products.size} active/draft products`);

// ---- 2. Plan ---------------------------------------------------------------------------
const plan = [];
const report = [];
const count = {changed: 0, already: 0, check: 0, mixed: 0};
for (const p of products.values()) {
  const priceSet = [...new Set(p.variants.map((v) => cents(v.price)))];
  // Products with one price per size (should be all of them after uniform-price.mjs):
  // round that one price. Mixed ones: round the lowest and give it to every size.
  const base = Math.min(...priceSet);
  if (priceSet.length > 1) count.mixed++;
  const compareAts = p.variants.map((v) => v.compareAtPrice).filter((w) => w != null && Number(w) > 0).map(cents);
  const t = target(base, compareAts);
  if (t.price == null) {
    count.check++;
    report.push([p.handle, p.title, p.status, eur(base), '', compareAts.length ? eur(Math.min(...compareAts)) : '', t.note]);
    continue;
  }
  const updates = p.variants.filter((v) => cents(v.price) !== t.price);
  if (!updates.length) { count.already++; continue; }
  count.changed++;
  report.push([p.handle, p.title, p.status, eur(base), eur(t.price), compareAts.length ? eur(Math.min(...compareAts)) : '',
    priceSet.length > 1 ? `${t.note}; sizes had different prices, now one` : t.note]);
  plan.push({pid: p.id, handle: p.handle, price: eur(t.price), updates});
}
const reportFile = `round-prices-${ts}-report.csv`;
writeFileSync(reportFile, ['handle,title,status,price_now,new_price,crossed_out,note']
  .concat(report.map((r) => r.map(csvCell).join(','))).join('\n'));
console.log(`${count.changed} products get a .95 price, ${count.already} already end in .95, ${count.check} skipped (CHECK)` +
  (count.mixed ? `, ${count.mixed} had different prices per size (now one price)` : '') + '.');
console.log(`Report: ${reportFile}`);
if (!APPLY) { console.log('Dry run: nothing changed. Re-run with --apply.'); process.exit(0); }

// ---- 3. Apply --------------------------------------------------------------------------
const rollbackFile = `round-prices-rollback-${ts}.json`;
writeFileSync(rollbackFile, JSON.stringify(plan.map((p) => ({
  productId: p.pid, handle: p.handle,
  variants: p.updates.map((v) => ({variantId: v.id, price: v.price, compareAtPrice: v.compareAtPrice})),
})), null, 1));
console.log(`Rollback written: ${rollbackFile}`);

let failed = 0;
for (const [i, p] of plan.entries()) {
  try {
    const r = await gql(
      `mutation($pid: ID!, $v: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $pid, variants: $v) { userErrors { message } }
      }`,
      // price only: compareAtPrice is not sent, so crossed-out prices stay exactly as they are
      {pid: p.pid, v: p.updates.map((v) => ({id: v.id, price: p.price}))},
    );
    if (r.productVariantsBulkUpdate?.userErrors?.length) throw new Error(JSON.stringify(r.productVariantsBulkUpdate.userErrors));
  } catch (error) {
    failed++;
    console.error(`\n${p.handle}: ${error.message}`);
  }
  if ((i + 1) % 25 === 0 || i + 1 === plan.length) process.stdout.write(`\r${i + 1}/${plan.length}`);
}
console.log(`\nDone: ${plan.length - failed} products now end in .95, ${failed} failed.`);
