#!/usr/bin/env node
/**
 * Gives every apparel / accessories product a `type:<slug>` tag derived from
 * its product type (T-Shirts -> type:t-shirts, Hoodies -> type:hoodies, …).
 *
 * WHY: the Brand filter on a clothing brand's page lists what the menu lists
 * under that brand — "Stussy -> T-Shirts, Hoodies" (owner request,
 * 2026-09-21). The storefront can only filter on tags: the Storefront API
 * ignores `productType` filters here because that facet is not enabled in
 * Search & Discovery (checked: stussy + {productType:"T-Shirts"} returned all
 * 53 products). Same reason sizes are tags — see sync-size-tags.mjs.
 *
 * Only `type:` tags are touched; a stale one (product type changed since) is
 * replaced. Footwear is skipped. The import and fix-categories now add the
 * tag themselves (typeTag in lib/taxonomy.mjs), so this is a one-off backfill
 * that is safe to re-run.
 *
 * Usage:
 *   node scripts/sync-type-tags.mjs            # dry run
 *   node scripts/sync-type-tags.mjs --apply
 * Rollback: remove every `type:*` tag — nothing else reads them.
 */
import {readFileSync} from 'node:fs';

import {createAdminClient} from './lib/admin.mjs';
import {typeTag} from './lib/taxonomy.mjs';

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

const TYPES = ['T-Shirts', 'Tops', 'Hoodies', 'Jackets', 'Pants', 'Shorts', 'Tracksuits', 'Accessories'];
const query = TYPES.map((type) => `product_type:"${type}"`).join(' OR ');

const todo = [];
const counts = {};
let cursor = null;
let seen = 0;
do {
  const data = await gql(
    `query($cursor: String, $query: String!) {
      products(first: 250, after: $cursor, query: $query) {
        pageInfo { hasNextPage endCursor }
        nodes { id productType tags }
      }
    }`,
    {cursor, query},
  );
  for (const product of data.products.nodes) {
    seen += 1;
    const want = typeTag(product.productType);
    if (!want) continue;
    counts[want] = (counts[want] ?? 0) + 1;
    const stale = product.tags.filter((tag) => tag.startsWith('type:') && tag !== want);
    if (product.tags.includes(want) && stale.length === 0) continue;
    todo.push({id: product.id, add: want, remove: stale});
  }
  cursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
} while (cursor);

console.log(`${seen} apparel/accessories products; ${todo.length} need a tag change`);
console.log(counts);
if (!APPLY) {
  console.log('Dry run — nothing written. Re-run with --apply.');
  process.exit(0);
}

let done = 0;
for (let start = 0; start < todo.length; start += 20) {
  const batch = todo.slice(start, start + 20);
  const parts = [];
  const variables = {};
  const defs = [];
  batch.forEach((item, i) => {
    defs.push(`$id${i}: ID!`, `$add${i}: [String!]!`);
    variables[`id${i}`] = item.id;
    variables[`add${i}`] = [item.add];
    parts.push(`a${i}: tagsAdd(id: $id${i}, tags: $add${i}) { userErrors { message } }`);
    if (item.remove.length > 0) {
      defs.push(`$rm${i}: [String!]!`);
      variables[`rm${i}`] = item.remove;
      parts.push(`r${i}: tagsRemove(id: $id${i}, tags: $rm${i}) { userErrors { message } }`);
    }
  });
  const data = await gql(`mutation(${defs.join(', ')}) { ${parts.join('\n')} }`, variables);
  for (const [key, value] of Object.entries(data)) {
    if (value?.userErrors?.length) console.error(key, JSON.stringify(value.userErrors));
  }
  done += batch.length;
  if (done % 200 === 0 || done === todo.length) console.log(`  ${done}/${todo.length}`);
}
console.log('done');
