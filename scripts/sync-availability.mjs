#!/usr/bin/env node
/**
 * 28 Sep 2026 — remove sizes that are sold out at SneakerAsk, catalogue-wide.
 * PRICES ARE NEVER CHANGED. Descriptions, titles, images, tags untouched.
 *
 * Why: every variant carries inventory 9,999, so Google and the store show
 * every size in stock. Most of the catalogue is sourced from SneakerAsk, where
 * many sizes are sold out (listed at €0). An "in stock" size that can't be
 * delivered is misleading availability (Merchant Center Misrepresentation).
 *
 * Rules (per product, matched on the shared Shopify handle):
 *   - SneakerAsk lists the size at €0 / unavailable  → size REMOVED here.
 *   - SneakerAsk lists the size with a price          → kept.
 *   - SneakerAsk doesn't list the size at all         → KEPT (unknown), reported.
 *   - SneakerAsk has NO size in stock at all          → product set to DRAFT.
 *   - All of OUR sizes would be removed               → product set to DRAFT
 *     (Shopify can't delete a product's last size; nothing is lost).
 *   - None of our sizes match any SneakerAsk size     → product SKIPPED,
 *     reported (probably a size-format difference, never guessed at).
 *   - Product not on SneakerAsk (404)                 → untouched (own stock).
 *   - Travis Scott / Cactus Jack / GEL-NYC / KAYANO   → skipped: already handled
 *     by scripts/price-from-sneakerask.mjs.
 *
 * SneakerAsk lookups are cached in sneakerask-cache.json (reused for 24 h), so
 * an interrupted run picks up where it stopped. ~9,000 lookups ≈ 1 hour.
 *
 * Usage:
 *   node scripts/sync-availability.mjs            # dry run → availability-<ts>-report.csv
 *   node scripts/sync-availability.mjs --apply    # rollback file first, then writes
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
const SKIP = /travis scott|cactus jack|gel nyc|gel kayano/;
const CACHE_FILE = 'sneakerask-cache.json';
const CACHE_TTL = 24 * 3600 * 1000;

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
/** "42 EU" / "42" / "EU 42" / "36 2/3 EU" / "36.5" → "42" / "36.5"; "M" → "m". */
function sizeKey(raw) {
  const s = String(raw ?? '').toLowerCase().replace(/\beu\b/g, '').replace(/,/g, '.').trim();
  const frac = s.match(/^(\d+)\s+[12]\/3/);
  if (frac) return `${frac[1]}.5`;
  const num = s.match(/^\d+(\.\d+)?/);
  return num ? String(Number.parseFloat(num[0])) : s.replace(/\s+/g, ' ');
}

// ---- 1. Export our active variants (lib/admin.mjs gql returns json.data) ----
async function exportVariants() {
  const start = await gql(`mutation {
    bulkOperationRunQuery(query: """
      { productVariants { edges { node {
          id title selectedOptions { name value }
          product { id handle title status }
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
    process.stdout.write(`\r  exporting variants: ${op.status} ${op.objectCount}   `);
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

const products = new Map();
for (const v of await exportVariants()) {
  const p = v.product;
  if (p.status !== 'ACTIVE' || SKIP.test(norm(p.title))) continue;
  if (!products.has(p.id)) products.set(p.id, {...p, variants: []});
  products.get(p.id).variants.push(v);
}
console.log(`  ${products.size} active products in scope (Travis Scott / GEL excluded)`);

// ---- 2. SneakerAsk lookups, cached ------------------------------------------
let cache = {};
if (existsSync(CACHE_FILE)) {
  try {
    cache = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    cache = {};
  }
}
const fresh = (e) => e && Date.now() - e.at < CACHE_TTL;
let n = 0;
let sinceSave = 0;
for (const p of products.values()) {
  n++;
  if (fresh(cache[p.handle])) continue;
  await sleep(350);
  let res;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(`${SOURCE}/products/${encodeURIComponent(p.handle)}.json`);
    } catch {
      res = {ok: false, status: 0};
    }
    if (res.ok || res.status === 404 || attempt >= 6) break;
    if (res.status !== 0 && res.status !== 429 && res.status < 500) break;
    await sleep(2000 * 2 ** attempt);
  }
  if (res.ok) {
    const {product} = await res.json();
    cache[p.handle] = {
      at: Date.now(),
      found: true,
      // Same shape as uniform-price.mjs writes — the two scripts share this cache.
      sizes: (product?.variants ?? []).map((v) => {
        const price = Number.parseFloat(v.price);
        return {key: sizeKey(v.option1 ?? v.title), price, inStock: price > 0 && v.available !== false};
      }),
    };
  } else if (res.status === 404) {
    cache[p.handle] = {at: Date.now(), found: false};
  } // other errors: not cached, product left untouched this run
  if (++sinceSave >= 100) {
    writeFileSync(CACHE_FILE, JSON.stringify(cache));
    sinceSave = 0;
  }
  process.stdout.write(`\r  sneakerask: ${n}/${products.size} checked`);
}
writeFileSync(CACHE_FILE, JSON.stringify(cache));
console.log();

// ---- 3. Plan ------------------------------------------------------------------
const plan = [];
const report = [];
const counts = {notOnSneakerAsk: 0, lookupFailed: 0, formatMismatch: 0, unlisted: 0};
for (const p of products.values()) {
  const src = cache[p.handle];
  if (!src) { counts.lookupFailed++; continue; }
  if (!src.found) { counts.notOnSneakerAsk++; continue; }
  const bySize = new Map(src.sizes.map((s) => [s.key, s.inStock]));
  const anyInStock = src.sizes.some((s) => s.inStock);
  const ourKeys = p.variants.map((v) => {
    const size = v.selectedOptions?.find((o) => /size|maat/i.test(o.name))?.value ?? v.title;
    return {v, size, key: sizeKey(size)};
  });
  if (!ourKeys.some((k) => bySize.has(k.key))) {
    counts.formatMismatch++;
    report.push([p.handle, p.title, '(all)', 'SKIPPED — no size matches SneakerAsk (format?)']);
    continue;
  }
  const remove = [];
  for (const k of ourKeys) {
    if (!bySize.has(k.key)) {
      counts.unlisted++;
      report.push([p.handle, p.title, k.size, 'kept — not listed on SneakerAsk']);
    } else if (!bySize.get(k.key)) {
      remove.push(k.v);
      report.push([p.handle, p.title, k.size, 'REMOVED — sold out on SneakerAsk']);
    }
  }
  if (!anyInStock || remove.length === p.variants.length) {
    for (const r of report) if (r[0] === p.handle && r[3].startsWith('REMOVED')) r[3] = 'product → DRAFT (all sold out)';
    plan.push({pid: p.id, handle: p.handle, draft: true, remove: []});
  } else if (remove.length) {
    plan.push({pid: p.id, handle: p.handle, draft: false, remove});
  }
}

const reportFile = `availability-${ts}-report.csv`;
writeFileSync(reportFile, ['handle,title,size,action'].concat(report.map((r) => r.map(csvCell).join(','))).join('\n'));
const nRemove = plan.reduce((a, p) => a + p.remove.length, 0);
const nDraft = plan.filter((p) => p.draft).length;
console.log(`${nRemove} sold-out sizes to remove on ${plan.filter((p) => !p.draft).length} products; ${nDraft} products → draft.`);
console.log(`Untouched: ${counts.notOnSneakerAsk} not on SneakerAsk, ${counts.formatMismatch} size-format mismatches, ${counts.lookupFailed} lookups failed; ${counts.unlisted} sizes kept because SneakerAsk doesn't list them.`);
console.log(`Report: ${reportFile}`);
if (!APPLY) {
  console.log('Dry run — nothing changed. Check the report, then re-run with --apply (lookups are cached).');
  process.exit(0);
}

// ---- 4. Apply -------------------------------------------------------------------
const rollbackFile = `availability-rollback-${ts}.json`;
writeFileSync(rollbackFile, JSON.stringify(plan.map((p) => ({
  productId: p.pid,
  handle: p.handle,
  setToDraft: p.draft,
  // Deleted variants can't be undeleted; this is what to re-add if needed.
  removedSizes: p.remove.map((v) => ({variantId: v.id, title: v.title})),
})), null, 1));
console.log(`Rollback written: ${rollbackFile}`);

let failed = 0;
for (const [i, p] of plan.entries()) {
  const errors = [];
  try {
    if (p.draft) {
      const r = await gql(
        `mutation($id: ID!) { productUpdate(product: {id: $id, status: DRAFT}) { userErrors { message } } }`,
        {id: p.pid},
      );
      errors.push(...(r.productUpdate?.userErrors ?? []).map((e) => e.message));
    } else {
      const r = await gql(
        `mutation($pid: ID!, $ids: [ID!]!) {
          productVariantsBulkDelete(productId: $pid, variantsIds: $ids) { userErrors { message } }
        }`,
        {pid: p.pid, ids: p.remove.map((v) => v.id)},
      );
      errors.push(...(r.productVariantsBulkDelete?.userErrors ?? []).map((e) => e.message));
    }
  } catch (error) {
    errors.push(error.message);
  }
  if (errors.length) {
    failed++;
    console.error(`\n${p.handle}: ${errors.join(' | ')}`);
  }
  if ((i + 1) % 25 === 0 || i + 1 === plan.length) process.stdout.write(`\r${i + 1}/${plan.length} products`);
}
console.log(`\nDone: ${plan.length - failed} products updated, ${failed} failed.`);
