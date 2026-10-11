#!/usr/bin/env node
/**
 * 28 Sep 2026 — ONE price for every size of a product (owner's rule).
 *
 * Why: scripts/fix-pricing.mjs (step 1, 12:24) raised prices SIZE BY SIZE to
 * "at most 30% below the crossed-out price" — and many products had a
 * different crossed-out price per size. Result: ~1,440 products where sizes
 * now cost different amounts (e.g. Air Max 1 Patta: €94.95 in one size,
 * €329.88 in another).
 *
 * Rule, per product whose sizes don't all have the same price:
 *   - On SneakerAsk with at least one size in stock:
 *       price = SneakerAsk's CHEAPEST in-stock size, minus 15% if that is
 *       above €200, otherwise minus 10% (same rule as price-from-sneakerask.mjs).
 *   - Not on SneakerAsk / nothing in stock there / fewer than 3 sizes in stock
 *     there / SneakerAsk result more than 3× today's lowest price:
 *       price = the LOWEST price any of its sizes has now ("CHECK" rows in the
 *       report are the outliers worth a manual look).
 *   - Every size gets that one price. Crossed-out prices are kept only if
 *     realistic (above the new price, at most 30% off), otherwise cleared.
 * Products whose sizes already share one price are not touched.
 * Only prices change — no sizes removed, no text/images touched.
 *
 * SneakerAsk lookups share sneakerask-cache.json with sync-availability.mjs.
 *
 *   node scripts/uniform-price.mjs            # dry run → uniform-price-<ts>-report.csv
 *   node scripts/uniform-price.mjs --apply    # uniform-price-rollback-<ts>.json first
 */
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {createAdminClient} from './lib/admin.mjs';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  if (!line.includes('=') || line.trimStart().startsWith('#')) continue;
  const i = line.indexOf('=');
  const key = line.slice(0, i).trim();
  const value = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  if (value && !process.env[key]) process.env[key] = value;
}
const APPLY = process.argv.includes('--apply');
const SOURCE = 'https://sneakerask.com';
const CACHE_FILE = 'sneakerask-cache.json';
const CACHE_TTL = 24 * 3600 * 1000;
const MAX_DISCOUNT = 0.3;
const belowSneakerAsk = (price) => (price > 200 ? 0.15 : 0.1);

const {gql} = createAdminClient({
  shop: (process.env.SHOPIFY_SHOP || process.env.PUBLIC_STORE_DOMAIN).replace(/\.myshopify\.com$/, ''),
  clientId: process.env.SHOPIFY_CLIENT_ID,
  clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
  apiVersion: '2025-07',
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
/** Same normaliser as sync-availability.mjs — the two scripts share the cache. */
function sizeKey(raw) {
  const s = String(raw ?? '').toLowerCase().replace(/\beu\b/g, '').replace(/,/g, '.').trim();
  const frac = s.match(/^(\d+)\s+[12]\/3/);
  if (frac) return `${frac[1]}.5`;
  const num = s.match(/^\d+(\.\d+)?/);
  return num ? String(Number.parseFloat(num[0])) : s.replace(/\s+/g, ' ');
}
const money = (n) => (Math.round(n * 100) / 100).toFixed(2);
const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// ---- 1. Export variants (lib/admin.mjs gql returns json.data) -------------------
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
    if (v.product.status !== 'ACTIVE') continue;
    if (!products.has(v.product.id)) products.set(v.product.id, {...v.product, variants: []});
    products.get(v.product.id).variants.push(v);
  }
}
const mixed = [...products.values()].filter((p) => new Set(p.variants.map((v) => Number(v.price).toFixed(2))).size > 1);
console.log(`  ${products.size} active products; ${mixed.length} have different prices per size`);

// ---- 2. SneakerAsk cheapest in-stock price (cached) --------------------------------
let cache = {};
if (existsSync(CACHE_FILE)) {
  try { cache = JSON.parse(readFileSync(CACHE_FILE, 'utf8')); } catch { cache = {}; }
}
const usable = (e) => e && Date.now() - e.at < CACHE_TTL && (!e.found || e.sizes?.every((s) => 'price' in s));
let n = 0;
let sinceSave = 0;
for (const p of mixed) {
  n++;
  if (usable(cache[p.handle])) continue;
  await sleep(350);
  let res;
  for (let attempt = 0; ; attempt++) {
    try { res = await fetch(`${SOURCE}/products/${encodeURIComponent(p.handle)}.json`); } catch { res = {ok: false, status: 0}; }
    if (res.ok || res.status === 404 || attempt >= 6) break;
    if (res.status !== 0 && res.status !== 429 && res.status < 500) break;
    await sleep(2000 * 2 ** attempt);
  }
  if (res.ok) {
    const {product} = await res.json();
    cache[p.handle] = {
      at: Date.now(),
      found: true,
      sizes: (product?.variants ?? []).map((v) => {
        const price = Number.parseFloat(v.price);
        return {key: sizeKey(v.option1 ?? v.title), price, inStock: price > 0 && v.available !== false};
      }),
    };
  } else if (res.status === 404) {
    cache[p.handle] = {at: Date.now(), found: false};
  }
  if (++sinceSave >= 100) { writeFileSync(CACHE_FILE, JSON.stringify(cache)); sinceSave = 0; }
  process.stdout.write(`\r  sneakerask: ${n}/${mixed.length} checked`);
}
writeFileSync(CACHE_FILE, JSON.stringify(cache));
console.log();

// ---- 3. Plan ---------------------------------------------------------------------------
const plan = [];
const report = [];
const src = {sneakerask: 0, lowest: 0};
for (const p of mixed) {
  const c = cache[p.handle];
  const inStock = (c?.found ? c.sizes : []).filter((s) => s.inStock).map((s) => s.price);
  let target;
  let how;
  const lowestNow = Math.min(...p.variants.map((v) => Number(v.price)));
  // Safety (28 Sep 2026): SneakerAsk's last 1–2 leftover sizes are often
  // listed at silly prices (Kayano 14 Triple White: €1,079+ for a ~€160 shoe).
  // Fewer than 3 sizes in stock, or a result above 3× today's lowest price →
  // fall back to today's lowest price and list it for a manual check.
  const cheapestSA = inStock.length ? Math.min(...inStock) : null;
  const tooFew = inStock.length > 0 && inStock.length < 3;
  const tooHigh = cheapestSA != null && cheapestSA * (1 - belowSneakerAsk(cheapestSA)) > lowestNow * 3;
  if (inStock.length && !tooFew && !tooHigh) {
    const cheapest = cheapestSA;
    target = money(cheapest * (1 - belowSneakerAsk(cheapest)));
    how = `SneakerAsk cheapest €${cheapest.toFixed(2)} −${Math.round(belowSneakerAsk(cheapest) * 100)}%`;
    src.sneakerask++;
  } else {
    target = money(lowestNow);
    how = tooFew
      ? `CHECK: only ${inStock.length} size(s) at SneakerAsk (cheapest €${cheapestSA.toFixed(2)}) → kept lowest current price`
      : tooHigh
        ? `CHECK: SneakerAsk €${cheapestSA.toFixed(2)} is >3× today's price → kept lowest current price`
        : 'lowest current size price (not in stock / not on SneakerAsk)';
    src.lowest++;
  }
  const updates = p.variants.map((v) => {
    const was = v.compareAtPrice == null ? null : Number(v.compareAtPrice);
    const keep = was != null && was > Number(target) && Number(target) >= was * (1 - MAX_DISCOUNT);
    return {id: v.id, price: target, compareAtPrice: keep ? v.compareAtPrice : null, old: v};
  });
  const prices = p.variants.map((v) => Number(v.price));
  report.push([p.handle, p.title, money(Math.min(...prices)), money(Math.max(...prices)), target, how]);
  plan.push({pid: p.id, handle: p.handle, updates});
}
const reportFile = `uniform-price-${ts}-report.csv`;
writeFileSync(reportFile, ['handle,title,lowest_size_now,highest_size_now,new_price_all_sizes,source']
  .concat(report.map((r) => r.map(csvCell).join(','))).join('\n'));
console.log(`${plan.length} products get one price: ${src.sneakerask} from SneakerAsk, ${src.lowest} from their lowest current price.`);
console.log(`Report: ${reportFile}`);
if (!APPLY) { console.log('Dry run — nothing changed. Re-run with --apply.'); process.exit(0); }

const rollbackFile = `uniform-price-rollback-${ts}.json`;
writeFileSync(rollbackFile, JSON.stringify(plan.map((p) => ({
  productId: p.pid, handle: p.handle,
  variants: p.updates.map((u) => ({variantId: u.id, price: u.old.price, compareAtPrice: u.old.compareAtPrice})),
})), null, 1));
console.log(`Rollback written: ${rollbackFile}`);

let failed = 0;
for (const [i, p] of plan.entries()) {
  try {
    const r = await gql(
      `mutation($pid: ID!, $v: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $pid, variants: $v) { userErrors { message } }
      }`,
      {pid: p.pid, v: p.updates.map(({id, price, compareAtPrice}) => ({id, price, compareAtPrice}))},
    );
    if (r.productVariantsBulkUpdate?.userErrors?.length) throw new Error(JSON.stringify(r.productVariantsBulkUpdate.userErrors));
  } catch (error) {
    failed++;
    console.error(`\n${p.handle}: ${error.message}`);
  }
  if ((i + 1) % 25 === 0 || i + 1 === plan.length) process.stdout.write(`\r${i + 1}/${plan.length}`);
}
console.log(`\nDone: ${plan.length - failed} products now have one price, ${failed} failed.`);
