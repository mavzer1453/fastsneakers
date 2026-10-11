#!/usr/bin/env node
/**
 * Curates the two Travis Scott shelves (owner request, 2026-09-21):
 * "adult shoes only, the lows first, no laces".
 *
 *   travis-scott-sneakers  (manual collection — the homepage tile lands here)
 *     - kids pairs (TD / PS / GS / Enfant / Bébé) are REMOVED. They stay in
 *       `kids` and `kids-sneakers`, which match on the same title markers.
 *     - order: Air Jordan 1 Lows first, then every other adult pair. Inside
 *       each group the existing hand-made order is kept.
 *
 *   travis-scott  (smart collection — "everything Travis Scott")
 *     - rules change from  title ~ "Travis Scott" OR title ~ "Cactus Jack"
 *       to  title ~ "Travis Scott" AND type != Accessories AND title has no
 *       kids marker. That drops the six shoelace listings (still in
 *       `shoelaces` / `accessories`) and the kids pairs. Every product in the
 *       old collection had "Travis Scott" in its title, so nothing else falls
 *       out — but a future listing titled only "Cactus Jack …" will not join
 *       on its own.
 *     - sort order BEST_SELLING -> MANUAL: the sneakers shelf's order first,
 *       then the apparel in the order it had.
 *
 * The storefront pins `bestseller`-tagged products above a collection's own
 * order, which would undo "lows first"; both handles are listed in
 * CURATED_ORDER_HANDLES in the collection route so the order set here is the
 * order shoppers see.
 *
 * Usage:
 *   node scripts/curate-travis-scott.mjs            # dry run, prints the plan
 *   node scripts/curate-travis-scott.mjs --apply    # writes + rollback file
 *
 * Rollback: travis-scott-rollback-<timestamp>.json holds the previous rules,
 * sort order, product order and the removed product ids.
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
const {gql} = createAdminClient({
  shop: SHOP,
  clientId: process.env.SHOPIFY_CLIENT_ID,
  clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
  apiVersion: '2025-07',
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Mirrors isKidsProduct in app/lib/sizes.ts. */
const isKids = (title) =>
  /\((?:td|ps|gs|i)\)|\b(?:td|ps|gs)\b|\b(?:enfant|toddler|infants?|kids?)\b|b[ée]b[ée]/i.test(
    title,
  );
const isSneaker = (p) => /^sneakers?$/i.test(p.productType ?? '');
const isLow = (p) => (p.tags ?? []).includes('model:air-jordan-1-low');

const NEW_RULES = [
  {column: 'TITLE', relation: 'CONTAINS', condition: 'Travis Scott'},
  {column: 'TYPE', relation: 'NOT_EQUALS', condition: 'Accessories'},
  {column: 'TITLE', relation: 'NOT_CONTAINS', condition: '(PS)'},
  {column: 'TITLE', relation: 'NOT_CONTAINS', condition: '(TD)'},
  {column: 'TITLE', relation: 'NOT_CONTAINS', condition: '(GS)'},
  {column: 'TITLE', relation: 'NOT_CONTAINS', condition: 'Enfant'},
  {column: 'TITLE', relation: 'NOT_CONTAINS', condition: 'Bébé'},
];

async function collectionByHandle(handle) {
  const data = await gql(
    `query($q: String!) {
      collections(first: 1, query: $q) {
        nodes {
          id handle title sortOrder
          ruleSet { appliedDisjunctively rules { column relation condition } }
        }
      }
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
  for (let i = 0; i < 40; i += 1) {
    const data = await gql(`query($id: ID!) { job(id: $id) { done } }`, {id: job.id});
    if (data.job?.done) return;
    await sleep(1500);
  }
  throw new Error(`Job ${job.id} did not finish`);
}

function fail(label, errors) {
  if (errors?.length) throw new Error(`${label}: ${JSON.stringify(errors)}`);
}

async function reorder(id, orderedIds) {
  for (let start = 0; start < orderedIds.length; start += 200) {
    const moves = orderedIds.slice(start, start + 200).map((productId, i) => ({
      id: productId,
      newPosition: String(start + i),
    }));
    const data = await gql(
      `mutation($id: ID!, $moves: [MoveInput!]!) {
        collectionReorderProducts(id: $id, moves: $moves) {
          job { id } userErrors { field message }
        }
      }`,
      {id, moves},
    );
    fail('reorder', data.collectionReorderProducts.userErrors);
    await waitForJob(data.collectionReorderProducts.job);
  }
}

/** Lows first, then the rest — relative order inside each group untouched. */
const lowsFirst = (list) => [...list.filter(isLow), ...list.filter((p) => !isLow(p))];

// ---------------------------------------------------------------- plan -----

const sneakersCol = await collectionByHandle('travis-scott-sneakers');
const allCol = await collectionByHandle('travis-scott');
const sneakersBefore = await productsOf(sneakersCol.id);
const allBefore = await productsOf(allCol.id);

const kidsInSneakers = sneakersBefore.filter((p) => isKids(p.title) || !isSneaker(p));
const sneakersAfter = lowsFirst(sneakersBefore.filter((p) => !kidsInSneakers.includes(p)));

const keptInAll = allBefore.filter(
  (p) => !isKids(p.title) && (p.productType ?? '') !== 'Accessories' && /travis scott/i.test(p.title),
);
const droppedFromAll = allBefore.filter((p) => !keptInAll.includes(p));
const shelfIds = new Set(sneakersAfter.map((p) => p.id));
const allAfter = [
  ...sneakersAfter.filter((p) => keptInAll.some((k) => k.id === p.id)),
  ...lowsFirst(keptInAll.filter((p) => isSneaker(p) && !shelfIds.has(p.id))),
  ...keptInAll.filter((p) => !isSneaker(p)),
];

console.log(`\ntravis-scott-sneakers: ${sneakersBefore.length} -> ${sneakersAfter.length}`);
console.log(`  removed (${kidsInSneakers.length}):`);
kidsInSneakers.forEach((p) => console.log(`    - ${p.title}`));
console.log('  new order:');
sneakersAfter.forEach((p, i) => console.log(`    ${String(i + 1).padStart(2)}. ${p.title}`));

console.log(`\ntravis-scott: ${allBefore.length} -> ${allAfter.length}, sort ${allCol.sortOrder} -> MANUAL`);
console.log(`  leaves the collection (${droppedFromAll.length}):`);
droppedFromAll.forEach((p) => console.log(`    - [${p.productType}] ${p.title}`));
console.log('  new order:');
allAfter.forEach((p, i) => console.log(`    ${String(i + 1).padStart(2)}. [${p.productType}] ${p.title}`));

if (!APPLY) {
  console.log('\nDry run — nothing written. Re-run with --apply.');
  process.exit(0);
}

// --------------------------------------------------------------- apply -----

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const rollbackPath = new URL(`../travis-scott-rollback-${stamp}.json`, import.meta.url);
writeFileSync(
  rollbackPath,
  JSON.stringify(
    {
      'travis-scott-sneakers': {
        id: sneakersCol.id,
        sortOrder: sneakersCol.sortOrder,
        order: sneakersBefore.map((p) => ({id: p.id, title: p.title})),
        removed: kidsInSneakers.map((p) => ({id: p.id, title: p.title})),
      },
      'travis-scott': {
        id: allCol.id,
        sortOrder: allCol.sortOrder,
        ruleSet: allCol.ruleSet,
        order: allBefore.map((p) => ({id: p.id, title: p.title})),
      },
    },
    null,
    2,
  ),
);
console.log(`\nRollback written: ${rollbackPath.pathname.split('/').pop()}`);

if (kidsInSneakers.length > 0) {
  const data = await gql(
    `mutation($id: ID!, $productIds: [ID!]!) {
      collectionRemoveProducts(id: $id, productIds: $productIds) {
        job { id } userErrors { field message }
      }
    }`,
    {id: sneakersCol.id, productIds: kidsInSneakers.map((p) => p.id)},
  );
  fail('remove', data.collectionRemoveProducts.userErrors);
  await waitForJob(data.collectionRemoveProducts.job);
}
await reorder(sneakersCol.id, sneakersAfter.map((p) => p.id));
console.log('travis-scott-sneakers: done');

{
  const data = await gql(
    `mutation($input: CollectionInput!) {
      collectionUpdate(input: $input) {
        job { id } userErrors { field message }
      }
    }`,
    {
      input: {
        id: allCol.id,
        sortOrder: 'MANUAL',
        ruleSet: {appliedDisjunctively: false, rules: NEW_RULES},
      },
    },
  );
  fail('update', data.collectionUpdate.userErrors);
  await waitForJob(data.collectionUpdate.job);
}
// Smart-collection membership settles asynchronously after a rule change.
for (let i = 0; i < 30; i += 1) {
  const now = await productsOf(allCol.id);
  if (now.length === allAfter.length) break;
  await sleep(2000);
}
await reorder(allCol.id, allAfter.map((p) => p.id));
console.log('travis-scott: done');
