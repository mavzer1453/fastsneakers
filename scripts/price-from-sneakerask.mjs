#!/usr/bin/env node
/**
 * 28 Sep 2026 — price Travis Scott / Cactus Jack and ASICS GEL-NYC / KAYANO
 * products EXACTLY at SneakerAsk, size by size (owner's decision).
 *
 * Why: these were on a flat €179.99 / €109.99 regardless of model, which put
 * pairs like the Jordan 4 Cactus Jack and SB Dunk Low Travis Scott at a
 * fraction of market — the counterfeit signal behind the Merchant Center
 * Misrepresentation suspension.
 *
 * How (owner's rules, 28 Sep 2026):
 *   - Looks each product up on SneakerAsk by handle
 *     (sneakerask.com/products/<handle>.json — both stores share handles).
 *   - Every in-stock size gets ONE price: SneakerAsk's CHEAPEST in-stock size
 *     for that product, minus 15% if that price is above €200, else minus 10%. Sizes are still matched individually
 *     (after normalising "42 EU" = "42", "36 2/3" = "36.5") to decide which
 *     sizes are in stock.
 *   - A size that is sold out on SneakerAsk (price €0, unavailable, or not
 *     listed) is REMOVED from our product (variant deleted).
 *   - If EVERY size is sold out, the product is set to DRAFT instead (Shopify
 *     can't delete a product's last variant, and nothing is lost).
 *   - Crossed-out ("compare-at") prices are KEPT when realistic: above the
 *     new price and at most 30% off. A "was" price at or below the new price,
 *     or more than 30% above it, is cleared — never invented or inflated.
 *   - Products not found on SneakerAsk at all are left untouched and listed
 *     (they may be own stock).
 *
 * Usage:
 *   node scripts/price-from-sneakerask.mjs            # dry run → sneakerask-prices-<ts>.csv
 *   node scripts/price-from-sneakerask.mjs --apply    # writes; rollback file first
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
const SOURCE = 'https://sneakerask.com';
const TARGET = /travis scott|cactus jack|gel nyc|gel kayano/;
const {gql} = createAdminClient({
  shop: (process.env.SHOPIFY_SHOP || process.env.PUBLIC_STORE_DOMAIN).replace(/\.myshopify\.com$/, ''),
  clientId: process.env.SHOPIFY_CLIENT_ID,
  clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
  apiVersion: '2025-07',
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const norm = (s) => (s ?? '').toLowerCase().replace(/[-_]/g, ' ');
const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** "42 EU" / "42" / "EU 42" / "36 2/3 EU" / "36.5" → "42" / "36.5". */
function sizeKey(raw) {
  let s = String(raw ?? '').toLowerCase().replace(/\beu\b/g, '').replace(/,/g, '.').trim();
  const frac = s.match(/^(\d+)\s+[12]\/3/);
  if (frac) return `${frac[1]}.5`;
  const num = s.match(/^\d+(\.\d+)?/);
  return num ? String(Number.parseFloat(num[0])) : s.replace(/\s+/g, ' ');
}

// ---- SneakerAsk, one product at a time ------------------------------------
// The paged /products.json listing stops at 5,000 products (page 21 answers
// 503 forever), so look each of OUR products up by handle instead:
// /products/<handle>.json. 404 = SneakerAsk doesn't carry it.
async function fetchSourceFor(handles) {
  const all = new Map();
  let n = 0;
  for (const handle of handles) {
    n++;
    await sleep(400);
    let res;
    for (let attempt = 0; ; attempt++) {
      try {
        res = await fetch(`${SOURCE}/products/${encodeURIComponent(handle)}.json`);
      } catch {
        res = {ok: false, status: 0};
      }
      if (res.ok || res.status === 404 || attempt >= 6) break;
      if (res.status !== 0 && res.status !== 429 && res.status < 500) break;
      await sleep(2000 * 2 ** attempt);
    }
    if (res.ok) {
      const {product} = await res.json();
      if (product) all.set(handle, product);
    } else if (res.status !== 404) {
      console.warn(`\n  sneakerask: ${handle} → HTTP ${res.status}, skipped`);
    }
    process.stdout.write(`\r  sneakerask: ${n}/${handles.length} looked up, ${all.size} found`);
  }
  process.stdout.write('\n');
  return all;
}

// ---- Our products in scope --------------------------------------------------
async function fetchOurs() {
  const out = [];
  let cursor = null;
  for (;;) {
    const d = await gql(
      `query($c: String) { products(first: 250, after: $c) {
        pageInfo { hasNextPage endCursor } nodes { id handle title } } }`,
      {c: cursor},
    );
    for (const p of d.products.nodes) if (TARGET.test(norm(p.title))) out.push(p);
    if (!d.products.pageInfo.hasNextPage) break;
    cursor = d.products.pageInfo.endCursor;
  }
  for (const p of out) {
    const d = await gql(
      `query($id: ID!) { product(id: $id) { variants(first: 100) {
        nodes { id title sku price compareAtPrice selectedOptions { name value } } } status } }`,
      {id: p.id},
    );
    p.variants = d.product.variants.nodes;
    p.status = d.product.status;
  }
  console.log(`  vespera: ${out.length} Travis Scott / GEL products in scope`);
  return out;
}

const ours = await fetchOurs();
const source = await fetchSourceFor(ours.map((p) => p.handle));

const MAX_DISCOUNT = 0.3;
/**
 * Owner, 28 Sep 2026: sell below SneakerAsk's cheapest size —
 * 15% below when that price is above €200, otherwise 10% below.
 */
const belowSneakerAsk = (price) => (price > 200 ? 0.15 : 0.1);
const plan = [];
const noMatch = [];
const report = [];
for (const p of ours) {
  const src = source.get(p.handle);
  if (!src) {
    noMatch.push(`${p.handle} — ${p.title}`);
    continue;
  }
  // Sizes SneakerAsk can actually supply right now.
  const inStock = new Map();
  for (const v of src.variants ?? []) {
    const price = Number.parseFloat(v.price);
    if (Number.isFinite(price) && price > 0 && v.available !== false) {
      inStock.set(sizeKey(v.option1 ?? v.title), price);
    }
  }

  // Owner's rule: one price for every size = SneakerAsk's cheapest in-stock size.
  const cheapest = inStock.size ? Math.min(...inStock.values()) : null;

  const entry = {pid: p.id, handle: p.handle, title: p.title, updates: [], deletes: [], draft: false};
  for (const v of p.variants) {
    const size = v.selectedOptions?.find((o) => /size|maat/i.test(o.name))?.value ?? v.title;
    const srcPrice = inStock.get(sizeKey(size));
    if (srcPrice == null) {
      entry.deletes.push(v);
      report.push([p.handle, p.title, size, v.price, v.compareAtPrice ?? '', '', '', 'SOLD OUT on SneakerAsk → size removed']);
      continue;
    }
    const price = (Math.round(cheapest * (1 - belowSneakerAsk(cheapest)) * 100) / 100).toFixed(2);
    const was = v.compareAtPrice == null ? null : Number.parseFloat(v.compareAtPrice);
    const realistic = was != null && was > Number(price) && Number(price) >= was * (1 - MAX_DISCOUNT);
    const compareAtPrice = realistic ? v.compareAtPrice : null;
    const note = `cheapest SneakerAsk size −${Math.round(belowSneakerAsk(cheapest) * 100)}%${was == null ? '' : realistic ? ', was-price kept' : ', unrealistic was-price cleared'}`;
    report.push([p.handle, p.title, size, v.price, v.compareAtPrice ?? '', price, compareAtPrice ?? '', note]);
    if (price !== Number.parseFloat(v.price).toFixed(2) || compareAtPrice !== v.compareAtPrice) {
      entry.updates.push({id: v.id, price, compareAtPrice, old: v});
    }
  }
  // Every size sold out → draft the product, delete nothing.
  if (entry.deletes.length === p.variants.length) {
    entry.deletes = [];
    entry.updates = [];
    entry.draft = p.status !== 'DRAFT';
    for (const r of report) if (r[0] === p.handle) r[7] = 'ALL sizes sold out → product set to DRAFT';
  }
  if (entry.updates.length || entry.deletes.length || entry.draft) plan.push(entry);
}

const reportFile = `sneakerask-prices-${ts}.csv`;
writeFileSync(
  reportFile,
  ['handle,title,size,old_price,old_was_price,new_price,new_was_price,action']
    .concat(report.map((r) => r.map(csvCell).join(',')))
    .join('\n'),
);
const nUpd = plan.reduce((n, p) => n + p.updates.length, 0);
const nDel = plan.reduce((n, p) => n + p.deletes.length, 0);
const nDraft = plan.filter((p) => p.draft).length;
console.log(`${ours.length} products checked: ${nUpd} sizes repriced, ${nDel} sold-out sizes removed, ${nDraft} products fully sold out → draft. Report: ${reportFile}`);
if (noMatch.length) {
  console.log(`${noMatch.length} products not found on SneakerAsk (left unchanged):`);
  for (const h of noMatch) console.log(`  - ${h}`);
}
if (!APPLY) {
  console.log('Dry run — nothing changed. Check the report, then re-run with --apply.');
  process.exit(0);
}

const rollbackFile = `sneakerask-price-rollback-${ts}.json`;
writeFileSync(rollbackFile, JSON.stringify(plan.map((p) => ({
  productId: p.pid,
  handle: p.handle,
  setToDraft: p.draft,
  repriced: p.updates.map((u) => ({variantId: u.id, price: u.old.price, compareAtPrice: u.old.compareAtPrice})),
  // Deleted variants can't be undeleted; this is what to re-add if needed.
  removedSizes: p.deletes.map((v) => ({title: v.title, sku: v.sku, price: v.price, compareAtPrice: v.compareAtPrice})),
})), null, 1));
console.log(`Rollback written: ${rollbackFile}`);

const run = async (query, variables) => {
  try {
    return await gql(query, variables);
  } catch (error) {
    return {error: error.message};
  }
};
let failed = 0;
for (const [i, p] of plan.entries()) {
  const errors = [];
  if (p.updates.length) {
    const r = await run(
      `mutation($pid: ID!, $v: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $pid, variants: $v) { userErrors { field message } }
      }`,
      {pid: p.pid, v: p.updates.map(({id, price, compareAtPrice}) => ({id, price, compareAtPrice}))},
    );
    if (r.error) errors.push(r.error);
    errors.push(...(r.productVariantsBulkUpdate?.userErrors ?? []).map((e) => e.message));
  }
  if (p.deletes.length) {
    const r = await run(
      `mutation($pid: ID!, $ids: [ID!]!) {
        productVariantsBulkDelete(productId: $pid, variantsIds: $ids) { userErrors { field message } }
      }`,
      {pid: p.pid, ids: p.deletes.map((v) => v.id)},
    );
    if (r.error) errors.push(r.error);
    errors.push(...(r.productVariantsBulkDelete?.userErrors ?? []).map((e) => e.message));
  }
  if (p.draft) {
    const r = await run(
      `mutation($id: ID!) { productUpdate(product: {id: $id, status: DRAFT}) { userErrors { field message } } }`,
      {id: p.pid},
    );
    if (r.error) errors.push(r.error);
    errors.push(...(r.productUpdate?.userErrors ?? []).map((e) => e.message));
  }
  if (errors.length) {
    failed++;
    console.error(`\n${p.handle}: ${errors.join(' | ')}`);
  }
  process.stdout.write(`\r${i + 1}/${plan.length} products`);
}
console.log(`\nDone: ${plan.length - failed} products updated, ${failed} failed.`);
