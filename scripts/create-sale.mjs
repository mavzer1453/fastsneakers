#!/usr/bin/env node
/**
 * 28 Sep 2026 — a REAL 10–20% sale on popular products, shown with a
 * crossed-out ("compare-at") price.
 *
 * What makes it compliant (EU Omnibus directive + Google Merchant Center):
 *   - The crossed-out price is the product's CURRENT price, and the selling
 *     price actually drops by 10–20%. Nothing is inflated.
 *   - A product whose price changed in the last 30 days is EXCLUDED: the
 *     crossed-out price must be the lowest price of the previous 30 days, and
 *     for those it isn't today's price. That excludes, for now, everything the
 *     28 Sep repricing touched — including all Travis Scott and ASICS GEL
 *     products. They become eligible 30 days after their last price change.
 *     Price history is read from the *-rollback-* files and pricing-plan CSVs.
 *
 * Discount by current price:  ≥ €200 → 20%   €100–199.99 → 15%   < €100 → 10%
 *
 * Selection (most popular first = lowest `bs:NNN` tag, then `bestseller` tag):
 *   --essentials=15   Fear of God Essentials
 *   --apparel=25      other clothing (tees, hoodies, jackets, pants, shorts…)
 *   --sneakers=40     popular models: Samba, Gazelle, Campus, Spezial, Dunk Low,
 *                     Jordan 1 Low/Mid, Air Force 1, Air Max 1/90, NB 9060/2002R/530/550
 *   --asics=15        ASICS (non-GEL-NYC/Kayano models that weren't repriced)
 *   --travis=15       Travis Scott (only any whose price hasn't changed in 30 days)
 *
 * Every sale product is tagged `sale-2026-autumn`.
 *
 *   node scripts/create-sale.mjs                 # dry run → sale-plan-<ts>.csv
 *   node scripts/create-sale.mjs --apply         # start the sale (rollback first)
 *   node scripts/create-sale.mjs --end           # dry run of ending it
 *   node scripts/create-sale.mjs --end --apply   # end: price back to the
 *                                                  crossed-out price, compare-at cleared, tag removed
 */
import {existsSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createAdminClient} from './lib/admin.mjs';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  if (!line.includes('=') || line.trimStart().startsWith('#')) continue;
  const i = line.indexOf('=');
  const key = line.slice(0, i).trim();
  const value = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  if (value && !process.env[key]) process.env[key] = value;
}
const arg = (name, def) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? Number.parseInt(a.split('=')[1], 10) : def;
};
const APPLY = process.argv.includes('--apply');
const END = process.argv.includes('--end');
const TAG = 'sale-2026-autumn';
const LIMITS = {
  essentials: arg('essentials', 15),
  apparel: arg('apparel', 25),
  sneakers: arg('sneakers', 40),
  asics: arg('asics', 15),
  travis: arg('travis', 15),
};
const discountFor = (price) => (price >= 200 ? 0.2 : price >= 100 ? 0.15 : 0.1);

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
const money = (n) => (Math.round(n * 100) / 100).toFixed(2);

// ---- Export products + variants -------------------------------------------------
async function exportCatalogue() {
  const start = await gql(`mutation {
    bulkOperationRunQuery(query: """
      { products { edges { node {
          id handle title vendor productType tags status
          variants { edges { node { id price compareAtPrice } } }
      } } } }
    """) { bulkOperation { id } userErrors { message } }
  }`);
  const errs = start.bulkOperationRunQuery?.userErrors;
  if (errs?.length) throw new Error(JSON.stringify(errs));
  const opId = start.bulkOperationRunQuery.bulkOperation.id;
  let url;
  for (;;) {
    await sleep(5000);
    const s = await gql(
      `query($id: ID!) { node(id: $id) { ... on BulkOperation { status objectCount url errorCode } } }`,
      {id: opId},
    );
    process.stdout.write(`\r  exporting catalogue: ${s.node.status} ${s.node.objectCount}   `);
    if (s.node.status === 'COMPLETED') { url = s.node.url; break; }
    if (['FAILED', 'CANCELED', 'EXPIRED'].includes(s.node.status)) throw new Error(s.node.errorCode);
  }
  console.log();
  const products = new Map();
  if (!url) return products;
  const lines = (await (await fetch(url)).text()).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  for (const o of lines) if (!o.__parentId) products.set(o.id, {...o, variants: []});
  for (const o of lines) if (o.__parentId) products.get(o.__parentId)?.variants.push(o);
  return products;
}

async function updateVariants(pid, variants) {
  const r = await gql(
    `mutation($pid: ID!, $v: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $pid, variants: $v) { userErrors { message } }
    }`,
    {pid, v: variants},
  );
  return (r.productVariantsBulkUpdate?.userErrors ?? []).map((e) => e.message);
}
async function setTag(pid, add) {
  const m = add ? 'tagsAdd' : 'tagsRemove';
  const r = await gql(`mutation($id: ID!, $tags: [String!]!) { ${m}(id: $id, tags: $tags) { userErrors { message } } }`, {id: pid, tags: [TAG]});
  return (r[m]?.userErrors ?? []).map((e) => e.message);
}

const products = await exportCatalogue();

// ---- END the sale ------------------------------------------------------------------
if (END) {
  const onSale = [...products.values()].filter((p) => p.tags.includes(TAG));
  console.log(`${onSale.length} products carry ${TAG}.`);
  if (!APPLY) { console.log('Dry run — re-run with --end --apply to end the sale.'); process.exit(0); }
  let failed = 0;
  for (const p of onSale) {
    const v = p.variants.filter((x) => x.compareAtPrice != null)
      .map((x) => ({id: x.id, price: x.compareAtPrice, compareAtPrice: null}));
    const errors = [...(v.length ? await updateVariants(p.id, v) : []), ...(await setTag(p.id, false))];
    if (errors.length) { failed++; console.error(`${p.handle}: ${errors.join(' | ')}`); }
  }
  console.log(`Sale ended on ${onSale.length - failed} products, ${failed} failed.`);
  process.exit(0);
}

// ---- Price changes in the last 30 days (from local rollback/plan files) --------------
const since = Date.now() - 30 * 24 * 3600 * 1000;
const changed = new Set(); // product handles AND product ids
for (const f of readdirSync('.')) {
  const m = f.match(/(\d{4}-\d{2}-\d{2})T\d{2}-\d{2}-\d{2}/);
  if (!m || new Date(m[1]).getTime() < since) continue;
  if (!/(price|reprice|pricing-plan|ami-prices|sneakerask-price)/.test(f)) continue;
  const text = readFileSync(f, 'utf8');
  if (f.startsWith('pricing-plan-')) {
    // Only rows whose price was actually raised (not "clear compare-at").
    for (const line of text.split('\n').slice(1)) if (/raised/.test(line)) changed.add(line.split(',')[0].replace(/"/g, ''));
    continue;
  }
  if (f.startsWith('price-rollback-')) continue; // superseded by the pricing-plan CSV above
  for (const h of text.matchAll(/"handle"\s*:\s*"([^"]+)"/g)) changed.add(h[1]);
  for (const id of text.matchAll(/"productId"\s*:\s*"([^"]+)"/g)) changed.add(id[1]);
  if (f.endsWith('.csv')) {
    const [head, ...rest] = text.split('\n');
    const col = head.split(',').map((c) => c.replace(/"/g, '').trim()).indexOf('handle');
    if (col >= 0) for (const line of rest) {
      const h = line.split(',')[col]?.replace(/"/g, '').trim();
      if (h) changed.add(h);
    }
  }
}
if (!existsSync('pricing-plan-2026-09-28T12-24-27.csv')) {
  console.warn('WARNING: pricing-plan-2026-09-28T12-24-27.csv not found — products raised on 28 Sep cannot be excluded. Aborting to be safe.');
  process.exit(1);
}
console.log(`  ${changed.size} products/handles had a price change in the last 30 days → excluded`);

// ---- Select --------------------------------------------------------------------------
const rank = (p) => {
  const bs = p.tags.find((t) => t.startsWith('bs:'));
  return (bs ? Number.parseInt(bs.slice(3), 10) : 999) - (p.tags.includes('bestseller') ? 0.5 : 0);
};
const APPAREL = /t shirt|tee|hoodie|sweater|crewneck|jacket|pants|shorts|sweatpant|jogger|tracksuit|set|polo|shirt|top|jersey/;
const SNEAKER_MODELS = /samba|gazelle|campus|spezial|handball|dunk low|jordan 1 (retro )?(low|mid)|air jordan 1 (low|mid)|air force 1|air max 1\b|air max 90|9060|2002r|\b530\b|\b550\b/;
const groupOf = (p) => {
  const t = norm(`${p.title} ${p.vendor}`);
  const type = norm(p.productType);
  if (/travis scott|cactus jack/.test(t)) return 'travis';
  if (/asics/.test(t)) return 'asics';
  if (/essentials|fear of god/.test(t)) return 'essentials';
  if (APPAREL.test(type) || APPAREL.test(norm(p.title))) return 'apparel';
  if (SNEAKER_MODELS.test(t)) return 'sneakers';
  return null;
};

const pools = {essentials: [], apparel: [], sneakers: [], asics: [], travis: []};
const excluded = {recentPrice: 0, alreadyOnSale: 0};
for (const p of products.values()) {
  if (p.status !== 'ACTIVE' || !p.variants.length || p.tags.includes(TAG)) continue;
  const g = groupOf(p);
  if (!g) continue;
  if (changed.has(p.handle) || changed.has(p.id)) { excluded.recentPrice++; continue; }
  if (p.variants.some((v) => v.compareAtPrice != null && Number(v.compareAtPrice) > Number(v.price))) { excluded.alreadyOnSale++; continue; }
  pools[g].push(p);
}
const plan = [];
for (const [g, list] of Object.entries(pools)) {
  list.sort((a, b) => rank(a) - rank(b));
  for (const p of list.slice(0, LIMITS[g])) {
    plan.push({
      group: g,
      p,
      variants: p.variants.map((v) => {
        const price = Number(v.price);
        const d = discountFor(price);
        return {id: v.id, compareAtPrice: money(price), price: money(price * (1 - d)), pct: Math.round(d * 100)};
      }),
    });
  }
  console.log(`  ${g}: ${list.length} eligible, ${Math.min(list.length, LIMITS[g])} selected`);
}
console.log(`  excluded: ${excluded.recentPrice} (price changed in last 30 days), ${excluded.alreadyOnSale} (already on sale)`);

const planFile = `sale-plan-${ts}.csv`;
writeFileSync(planFile, ['group,handle,title,was,now,discount']
  .concat(plan.map((x) => [x.group, x.p.handle, x.p.title, x.variants[0].compareAtPrice, x.variants[0].price, `${x.variants[0].pct}%`].map(csvCell).join(',')))
  .join('\n'));
console.log(`${plan.length} products go on sale. Plan: ${planFile}`);
if (!APPLY) { console.log('Dry run — nothing changed. Re-run with --apply.'); process.exit(0); }

const rollbackFile = `sale-rollback-${ts}.json`;
writeFileSync(rollbackFile, JSON.stringify(plan.map((x) => ({
  productId: x.p.id, handle: x.p.handle,
  variants: x.p.variants.map((v) => ({variantId: v.id, price: v.price, compareAtPrice: v.compareAtPrice})),
})), null, 1));
console.log(`Rollback written: ${rollbackFile}`);

let failed = 0;
for (const [i, x] of plan.entries()) {
  let errors;
  try {
    errors = [
      ...(await updateVariants(x.p.id, x.variants.map(({id, price, compareAtPrice}) => ({id, price, compareAtPrice})))),
      ...(await setTag(x.p.id, true)),
    ];
  } catch (error) {
    errors = [error.message];
  }
  if (errors.length) { failed++; console.error(`\n${x.p.handle}: ${errors.join(' | ')}`); }
  process.stdout.write(`\r${i + 1}/${plan.length}`);
}
console.log(`\nSale live on ${plan.length - failed} products, ${failed} failed. End it with: node scripts/create-sale.mjs --end --apply`);
