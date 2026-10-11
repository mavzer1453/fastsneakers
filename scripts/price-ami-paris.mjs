/**
 * 24 Sep 2026. First run: price = official retail − €30. Second run (owner:
 * "make the tracksuits 210 and other prices according to that"): price = 35%
 * of official retail (tracksuit €210 of €600). Compare-at =
 * the official retail, so the saving shows. Retail read from amiparis.com
 * (en-nl, EUR) on 24 Sep 2026:
 *   Ami de Coeur zipped hoodie €335 · track pants €265 · shorts €235.
 *   Tracksuit = zipped hoodie + track pants = €600.
 *   (AMI lists no white Ami de Coeur zip hoodie; every colour is €335.)
 * Dry run by default; --apply writes. Rollback file: ami-prices-rollback-<ts>.json
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

const RETAIL = {
  'ami-black-zipper': 335,
  'ami-white-zipper': 335,
  'ami-heart-shorts-1': 235,
  'ami-black-tracksuit': 600,
  'ami-white-tracksuit': 600,
};
// Owner, later on 24 Sep 2026: "make the tracksuits 210 and other prices
// according to that" → every item at the same share of its official price as
// the tracksuit (210 / 600 = 35%), rounded to whole euros.
const SHARE = 210 / 600;

const rollback = [];
for (const [handle, retail] of Object.entries(RETAIL)) {
  const d = await gql(`query($h: String!) { productByHandle(handle: $h) { id title variants(first: 100) { nodes { id price compareAtPrice } } } }`, {h: handle});
  const p = d.productByHandle;
  if (!p) { console.log(`MISSING ${handle}`); continue; }
  const price = Math.round(retail * SHARE).toFixed(2);
  const compare = retail.toFixed(2);
  const before = [...new Set(p.variants.nodes.map((v) => `${v.price}/${v.compareAtPrice}`))].join(' ');
  console.log(`${p.title}: ${before} -> ${price}/${compare} (${p.variants.nodes.length} variants)`);
  rollback.push({handle, productId: p.id, variants: p.variants.nodes});
  if (!APPLY) continue;
  const r = await gql(
    `mutation($pid: ID!, $v: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $pid, variants: $v) { userErrors { field message } } }`,
    {pid: p.id, v: p.variants.nodes.map((v) => ({id: v.id, price, compareAtPrice: compare}))},
  );
  const errs = r.productVariantsBulkUpdate.userErrors;
  console.log(errs.length ? `  FAILED ${JSON.stringify(errs)}` : '  updated');
}
if (APPLY) {
  const f = `ami-prices-rollback-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
  writeFileSync(f, JSON.stringify(rollback, null, 2));
  console.log('rollback:', f);
}
