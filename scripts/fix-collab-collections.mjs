#!/usr/bin/env node
/**
 * Makes the "Brand x Collab" collections hold what their name says (owner
 * request, 2026-09-21: "Nike x Off-White also shows adidas").
 *
 * They were built on the collab tag alone, and a collab tag says nothing
 * about the OTHER partner:
 *   nike-sacai    collab:sacai                 -> also UGG x sacai
 *   nike-supreme  collab:supreme + sneakers    -> also Vans x Supreme
 *   nike-off-white collab:off-white            -> an adidas Samba whose
 *                 COLOURWAY is "Off-White" (mis-tag, fixed in lib/taxonomy.mjs)
 *
 * Fix: nike-sacai and nike-supreme also require `brand:nike`; the mis-tagged
 * products lose `collab:off-white`. nike-off-white keeps its single rule on
 * purpose — the Air Jordan 5 Off-White pairs are brand:jordan and belong there,
 * and smart-collection rules cannot say "nike OR jordan" next to an AND.
 * The dropped pairs stay in `collabs` and in their own brand's collection.
 *
 * Usage: node scripts/fix-collab-collections.mjs [--apply]
 * Rollback: collab-collections-rollback-<timestamp>.json (old rule sets and
 * the tags removed).
 */
import {readFileSync, writeFileSync} from 'node:fs';

import {createAdminClient} from './lib/admin.mjs';
import {collabTags} from './lib/taxonomy.mjs';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  if (!line.includes('=') || line.trimStart().startsWith('#')) continue;
  const i = line.indexOf('=');
  const key = line.slice(0, i).trim();
  const value = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  if (value && !process.env[key]) process.env[key] = value;
}
const SHOP = (process.env.SHOPIFY_SHOP || process.env.PUBLIC_STORE_DOMAIN || '')
  .trim()
  .replace(/\.myshopify\.com$/, '');
const APPLY = process.argv.includes('--apply');
const {gql} = createAdminClient({
  shop: SHOP,
  clientId: process.env.SHOPIFY_CLIENT_ID,
  clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
  apiVersion: '2025-07',
});

const RULES = {
  'nike-sacai': [
    {column: 'TAG', relation: 'EQUALS', condition: 'collab:sacai'},
    {column: 'TAG', relation: 'EQUALS', condition: 'brand:nike'},
  ],
  'nike-supreme': [
    {column: 'TAG', relation: 'EQUALS', condition: 'collab:supreme'},
    {column: 'TAG', relation: 'EQUALS', condition: 'brand:nike'},
    {column: 'TYPE', relation: 'EQUALS', condition: 'sneakers'},
  ],
};

const rollback = {rules: {}, tagsRemoved: []};

// 1. Products carrying collab:off-white that the (fixed) taxonomy no longer
//    calls an Off-White collab.
const stale = [];
let cursor = null;
do {
  const data = await gql(
    `query($cursor: String) {
      products(first: 250, after: $cursor, query: "tag:'collab:off-white'") {
        pageInfo { hasNextPage endCursor }
        nodes { id title }
      }
    }`,
    {cursor},
  );
  for (const product of data.products.nodes) {
    if (!collabTags(product.title).includes('collab:off-white')) stale.push(product);
  }
  cursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
} while (cursor);
console.log(`collab:off-white to remove from ${stale.length} product(s):`);
stale.forEach((product) => console.log(`  - ${product.title}`));

// 2. Rule sets.
const collections = {};
for (const handle of Object.keys(RULES)) {
  const data = await gql(
    `query($q: String!) {
      collections(first: 1, query: $q) {
        nodes { id handle productsCount { count } ruleSet { appliedDisjunctively rules { column relation condition } } }
      }
    }`,
    {q: `handle:${handle}`},
  );
  const node = data.collections.nodes[0];
  if (!node || node.handle !== handle) throw new Error(`No collection ${handle}`);
  collections[handle] = node;
  rollback.rules[handle] = {id: node.id, ruleSet: node.ruleSet};
  console.log(
    `${handle} (${node.productsCount.count}): ${node.ruleSet.rules.map((r) => r.condition).join(' + ')}  ->  ${RULES[handle].map((r) => r.condition).join(' + ')}`,
  );
}

if (!APPLY) {
  console.log('\nDry run — nothing written. Re-run with --apply.');
  process.exit(0);
}

for (const product of stale) {
  const data = await gql(
    `mutation($id: ID!) { tagsRemove(id: $id, tags: ["collab:off-white"]) { userErrors { message } } }`,
    {id: product.id},
  );
  if (data.tagsRemove.userErrors.length) throw new Error(JSON.stringify(data.tagsRemove.userErrors));
  rollback.tagsRemoved.push({id: product.id, title: product.title, tag: 'collab:off-white'});
}
for (const [handle, rules] of Object.entries(RULES)) {
  const data = await gql(
    `mutation($input: CollectionInput!) { collectionUpdate(input: $input) { userErrors { field message } } }`,
    {input: {id: collections[handle].id, ruleSet: {appliedDisjunctively: false, rules}}},
  );
  if (data.collectionUpdate.userErrors.length) throw new Error(JSON.stringify(data.collectionUpdate.userErrors));
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const file = `collab-collections-rollback-${stamp}.json`;
writeFileSync(new URL(`../${file}`, import.meta.url), JSON.stringify(rollback, null, 2));
console.log(`\nApplied. Rollback: ${file}`);
