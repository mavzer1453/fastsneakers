#!/usr/bin/env node
/**
 * Puts a collection in a hand-picked order (owner requests, 2026-09-21) by
 * switching it to MANUAL sort and moving every product into place. Membership
 * and rules are NOT touched — only the order. (The Travis Scott shelves, which
 * also lose products, have their own script: curate-travis-scott.mjs.)
 *
 *   stussy  "show what the menu shows when you click Stussy": T-Shirts, then
 *           Hoodies, then the other apparel, and the Nike x Stussy sneakers
 *           last. They used to open the page, pinned as bestsellers.
 *   adidas  "Sambas first", then the rest of the menu's order: Gazelle,
 *           Campus, Handball Spezial, Superstar, XLG, Taekwondo, SL 72, and
 *           everything else (Yeezy included) after that.
 *
 * Inside each block the collection's previous order (best selling) is kept,
 * except that adult pairs come before kids sizes.
 *
 * The storefront pins `bestseller` products above a collection's own order;
 * every handle here must also be in CURATED_ORDER_HANDLES in
 * app/routes/($locale).collections.$handle.tsx or the order will not show.
 *
 * New products join a manually sorted collection wherever Shopify puts them —
 * re-run this after a big import.
 *
 * Usage:
 *   node scripts/curate-collection-order.mjs stussy adidas          # dry run
 *   node scripts/curate-collection-order.mjs stussy adidas --apply
 *
 * Rollback: collection-order-rollback-<timestamp>.json (previous sort order
 * and full product order per handle).
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

const SHOP = (process.env.SHOPIFY_SHOP || process.env.PUBLIC_STORE_DOMAIN || '')
  .trim()
  .replace(/\.myshopify\.com$/, '');
const APPLY = process.argv.includes('--apply');
const HANDLES = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const {gql} = createAdminClient({
  shop: SHOP,
  clientId: process.env.SHOPIFY_CLIENT_ID,
  clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
  apiVersion: '2025-07',
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Mirrors isKidsProduct in app/lib/sizes.ts. */
const isKids = (p) =>
  /\((?:td|ps|gs|i)\)|\b(?:td|ps|gs)\b|\b(?:enfant|toddler|infants?|kids?)\b|b[ée]b[ée]/i.test(
    p.title,
  );
const type = (p) => (p.productType ?? '').toLowerCase();
const hasModel = (...models) => (p) =>
  models.some((model) => (p.tags ?? []).includes(`model:${model}`));

/** Ordered blocks per handle; a product lands in the first block it matches. */
const PLANS = {
  stussy: [
    ['T-Shirts', (p) => type(p) === 't-shirts' || type(p) === 'tops'],
    ['Hoodies', (p) => type(p) === 'hoodies'],
    ['Other apparel', (p) => !/^(sneakers?|boots|slippers)$/.test(type(p))],
  ],
  adidas: [
    ['Samba', hasModel('adidas-samba')],
    ['Gazelle', hasModel('adidas-gazelle', 'adidas-gazelle-indoor', 'adidas-gazelle-bold')],
    ['Campus', hasModel('adidas-campus', 'adidas-campus-00s')],
    ['Handball Spezial', hasModel('adidas-spezial')],
    ['Superstar', hasModel('adidas-superstar')],
    ['XLG', hasModel('adidas-xlg')],
    ['Taekwondo', hasModel('adidas-taekwondo')],
    ['SL 72', hasModel('adidas-sl-72')],
  ],
};

async function collectionByHandle(handle) {
  const data = await gql(
    `query($q: String!) {
      collections(first: 1, query: $q) { nodes { id handle title sortOrder } }
    }`,
    {q: `handle:${handle}`},
  );
  const node = data.collections.nodes[0];
  if (!node || node.handle !== handle) throw new Error(`No collection ${handle}`);
  return node;
}

async function productsOf(id) {
  const out = [];
  let cursor = null;
  do {
    const data = await gql(
      `query($id: ID!, $cursor: String) {
        collection(id: $id) {
          products(first: 100, after: $cursor, sortKey: COLLECTION_DEFAULT) {
            pageInfo { hasNextPage endCursor }
            nodes { id title productType tags }
          }
        }
      }`,
      {id, cursor},
    );
    const page = data.collection.products;
    out.push(...page.nodes);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return out;
}

async function waitForJob(job) {
  if (!job?.id) return;
  for (let i = 0; i < 80; i += 1) {
    const data = await gql(`query($id: ID!) { job(id: $id) { done } }`, {id: job.id});
    if (data.job?.done) return;
    await sleep(1500);
  }
  throw new Error(`Job ${job.id} did not finish`);
}

function plan(handle, products) {
  const blocks = [...PLANS[handle].map(([label]) => ({label, items: []})), {label: 'Everything else', items: []}];
  for (const product of products) {
    const index = PLANS[handle].findIndex(([, test]) => test(product));
    blocks[index === -1 ? blocks.length - 1 : index].items.push(product);
  }
  for (const block of blocks) {
    block.items = [...block.items.filter((p) => !isKids(p)), ...block.items.filter(isKids)];
  }
  return blocks;
}

if (HANDLES.length === 0 || HANDLES.some((handle) => !PLANS[handle])) {
  console.error(`Usage: curate-collection-order.mjs <${Object.keys(PLANS).join('|')}>… [--apply]`);
  process.exit(1);
}

const rollback = {};
const work = [];
for (const handle of HANDLES) {
  const collection = await collectionByHandle(handle);
  const before = await productsOf(collection.id);
  const blocks = plan(handle, before);
  const after = blocks.flatMap((block) => block.items);
  console.log(`\n${handle}: ${before.length} products, sort ${collection.sortOrder} -> MANUAL`);
  for (const block of blocks) {
    const kids = block.items.filter(isKids).length;
    console.log(`  ${block.label.padEnd(18)} ${String(block.items.length).padStart(4)}${kids ? `  (${kids} kids, last)` : ''}`);
  }
  console.log('  first 8:');
  after.slice(0, 8).forEach((p, i) => console.log(`    ${i + 1}. ${p.title}`));
  rollback[handle] = {
    id: collection.id,
    sortOrder: collection.sortOrder,
    order: before.map((p) => p.id),
  };
  work.push({collection, after});
}

if (!APPLY) {
  console.log('\nDry run — nothing written. Re-run with --apply.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const file = `collection-order-rollback-${stamp}.json`;
writeFileSync(new URL(`../${file}`, import.meta.url), JSON.stringify(rollback));
console.log(`\nRollback written: ${file}`);

for (const {collection, after} of work) {
  if (collection.sortOrder !== 'MANUAL') {
    const data = await gql(
      `mutation($input: CollectionInput!) {
        collectionUpdate(input: $input) { job { id } userErrors { field message } }
      }`,
      {input: {id: collection.id, sortOrder: 'MANUAL'}},
    );
    if (data.collectionUpdate.userErrors.length) {
      throw new Error(JSON.stringify(data.collectionUpdate.userErrors));
    }
    await waitForJob(data.collectionUpdate.job);
  }
  const ids = after.map((p) => p.id);
  for (let start = 0; start < ids.length; start += 200) {
    const moves = ids.slice(start, start + 200).map((id, i) => ({id, newPosition: String(start + i)}));
    const data = await gql(
      `mutation($id: ID!, $moves: [MoveInput!]!) {
        collectionReorderProducts(id: $id, moves: $moves) { job { id } userErrors { field message } }
      }`,
      {id: collection.id, moves},
    );
    if (data.collectionReorderProducts.userErrors.length) {
      throw new Error(JSON.stringify(data.collectionReorderProducts.userErrors));
    }
    await waitForJob(data.collectionReorderProducts.job);
    console.log(`  ${collection.handle}: placed ${Math.min(start + 200, ids.length)}/${ids.length}`);
  }
  console.log(`${collection.handle}: done`);
}
