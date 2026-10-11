/**
 * One-off (24 Sep 2026): UGG "Samba Red" colourways were tagged
 * `model:adidas-samba` by the old /samba/ taxonomy rule, so they showed up
 * under the adidas Samba filter and collection. Removes that tag from any
 * product that is not `brand:adidas`. Dry run by default; --apply to write.
 * Adds the model tags the fixed rule gives instead (e.g. model:ugg-tasman).
 * Rollback: ugg-samba-tags-rollback-<timestamp>.json (products + the tags
 * removed and added).
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {createAdminClient} from './lib/admin.mjs';
import {modelTags} from './lib/taxonomy.mjs';

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

const found = [];
let after = null;
do {
  const data = await gql(
    `query($after: String) { products(first: 250, after: $after, query: "tag:'model:adidas-samba'") {
      pageInfo { hasNextPage endCursor } nodes { id title tags } } }`,
    {after},
  );
  const page = data.products;
  for (const node of page.nodes) {
    if (!node.tags.includes('brand:adidas')) found.push(node);
  }
  after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
} while (after);

console.log(`${found.length} non-adidas products tagged model:adidas-samba`);
for (const node of found) console.log('  ', node.title);
if (!APPLY || found.length === 0) process.exit(0);

const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
for (const node of found) {
  const res = await gql(
    `mutation($id: ID!, $tags: [String!]!) { tagsRemove(id: $id, tags: $tags) { userErrors { message } } }`,
    {id: node.id, tags: ['model:adidas-samba']},
  );
  const errors = [...res.tagsRemove.userErrors];
  const add = modelTags(node.title).filter((tag) => !node.tags.includes(tag));
  if (add.length > 0) {
    const added = await gql(
      `mutation($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { message } } }`,
      {id: node.id, tags: add},
    );
    errors.push(...added.tagsAdd.userErrors);
  }
  node.added = add;
  console.log(errors.length ? `  FAILED ${node.title}: ${errors[0].message}` : `  ${node.title}: -model:adidas-samba +${add.join(' +')}`);
}
writeFileSync(
  `ugg-samba-tags-rollback-${stamp}.json`,
  JSON.stringify({tagRemoved: 'model:adidas-samba', products: found}, null, 2),
);
