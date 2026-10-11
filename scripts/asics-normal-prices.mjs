#!/usr/bin/env node
/**
 * 28 Sep 2026 — put "normal" prices on ASICS whose SneakerAsk-based price is
 * an outlier (owner's request). SneakerAsk lists its last 1–2 leftover sizes
 * at silly prices (Gel-NYC at €2,168, Kayano 14 Triple White €917), and
 * price-from-sneakerask.mjs copied them.
 *
 * Plan: asics-normal-prices-plan.json (37 products) — products with fewer than
 * 3 sizes, or priced above €450, that are above their normal level:
 *   Gel-Kayano 14 → €159.95 (ASICS retail €160)
 *   Gel-NYC → €149.95, Gel-NYC 2.0 / Utility → €159.95 (asics.com/be)
 *   collaborations (Kith, JJJJound, Thom Browne, Zutomayo…) → capped at €349.95
 * Every size of a product gets that one price; crossed-out prices cleared.
 *
 *   node scripts/asics-normal-prices.mjs            # dry run
 *   node scripts/asics-normal-prices.mjs --apply    # asics-normal-price-rollback-<ts>.json first
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
const {gql} = createAdminClient({
  shop: (process.env.SHOPIFY_SHOP || process.env.PUBLIC_STORE_DOMAIN).replace(/\.myshopify\.com$/, ''),
  clientId: process.env.SHOPIFY_CLIENT_ID,
  clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
  apiVersion: '2025-07',
});
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const plan = JSON.parse(readFileSync('asics-normal-prices-plan.json', 'utf8'));

const work = [];
for (const item of plan) {
  const d = await gql(
    `query($h: String!) { productByHandle(handle: $h) { id status variants(first: 100) { nodes { id price compareAtPrice } } } }`,
    {h: item.handle},
  );
  const p = d.productByHandle;
  if (!p) { console.log(`  not found: ${item.handle}`); continue; }
  const now = Math.max(...p.variants.nodes.map((v) => Number(v.price)));
  console.log(`  €${now.toFixed(2).padStart(8)} → €${item.new.toFixed(2).padStart(7)}  ${item.title}`);
  work.push({item, p});
}
console.log(`${work.length} products.`);
if (!APPLY) { console.log('Dry run — nothing changed. Re-run with --apply.'); process.exit(0); }

const rollbackFile = `asics-normal-price-rollback-${ts}.json`;
writeFileSync(rollbackFile, JSON.stringify(work.map(({item, p}) => ({
  productId: p.id, handle: item.handle,
  variants: p.variants.nodes.map((v) => ({variantId: v.id, price: v.price, compareAtPrice: v.compareAtPrice})),
})), null, 1));
console.log(`Rollback written: ${rollbackFile}`);

let failed = 0;
for (const {item, p} of work) {
  try {
    const r = await gql(
      `mutation($pid: ID!, $v: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $pid, variants: $v) { userErrors { message } }
      }`,
      {pid: p.id, v: p.variants.nodes.map((v) => ({id: v.id, price: item.new.toFixed(2), compareAtPrice: null}))},
    );
    if (r.productVariantsBulkUpdate?.userErrors?.length) throw new Error(JSON.stringify(r.productVariantsBulkUpdate.userErrors));
  } catch (error) {
    failed++;
    console.error(`${item.handle}: ${error.message}`);
  }
}
console.log(`Done: ${work.length - failed} products repriced, ${failed} failed.`);
