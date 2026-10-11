#!/usr/bin/env node
/**
 * Curates the `bestseller` tag, which drives both the Bestsellers collection
 * and the badge on every product card.
 *
 * THREE RULES
 * -----------
 *   1. REMOVE from kids footwear, always.
 *      Six Travis Scott pairs were tagged in TD/PS sizes — Sail Bébé, Sail
 *      (TD), Reverse Mocha (TD), Reverse Mocha Enfant, Black Phantom Enfant,
 *      Black Phantom Bébé. A toddler shoe in an adult bestsellers rail is
 *      wrong twice: the shopper can't buy it in their size, and it displaces
 *      a product they could.
 *
 *   2. ADD to adult sneakers carrying --collab (default travis-scott).
 *      Same test as rule 1, inverted, so the two can never disagree.
 *
 *   3. ADD to Fear of God Essentials sets, capped at --essentials.
 *      The hoodies are already well covered (about a dozen tagged); the sets
 *      had none at all, which is why the rail never showed one.
 *
 * Kids detection matches app/lib/sizes.ts — the size markers the catalogue
 * puts in the title. Keep the two in step if either changes.
 *
 * Usage:
 *   node scripts/tag-bestsellers.mjs                      # dry run + CSV
 *   node scripts/tag-bestsellers.mjs --apply
 *   node scripts/tag-bestsellers.mjs --essentials=8 --apply
 *   node scripts/tag-bestsellers.mjs --collab=off-white --apply
 *
 * Flags:
 *   --apply           write; without it nothing changes
 *   --collab=slug     which collab to promote (default travis-scott)
 *   --essentials=N    how many Essentials sets to tag (default 12, 0 to skip)
 *   --no-kids-sweep   leave existing kids tags alone (not recommended)
 */

import {existsSync, readFileSync, writeFileSync} from 'node:fs';

import {createAdminClient} from './lib/admin.mjs';

// ---------------------------------------------------------------- config ---

const ENV_PATH = new URL('../.env', import.meta.url);
if (existsSync(ENV_PATH)) {
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    if (!line.includes('=') || line.trimStart().startsWith('#')) continue;
    const i = line.indexOf('=');
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (!value || process.env[key]) continue;
    process.env[key] = value;
  }
}

const SHOP = (process.env.SHOPIFY_SHOP || process.env.PUBLIC_STORE_DOMAIN || '')
  .trim()
  .replace(/\.myshopify\.com$/, '');
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

const APPLY = process.argv.includes('--apply');
const SWEEP_KIDS = !process.argv.includes('--no-kids-sweep');
const COLLAB =
  (process.argv.find((a) => a.startsWith('--collab=')) ?? '').slice(9) ||
  'travis-scott';
const ESSENTIALS_CAP = (() => {
  const raw = process.argv.find((a) => a.startsWith('--essentials='));
  if (!raw) return 12;
  const n = Number.parseInt(raw.slice(13), 10);
  return Number.isFinite(n) ? n : 12;
})();
const API_VERSION = '2025-07';

if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET in .env');
  process.exit(1);
}

const {gql} = createAdminClient({
  shop: SHOP,
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  apiVersion: API_VERSION,
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Mirrors isKidsProduct in app/lib/sizes.ts. (TD) toddler, (PS) pre-school,
 * (GS) grade school, plus the French listings the import brought through as
 * "Enfant" and "Bébé".
 */
function isKidsProduct(title) {
  return /\((?:td|ps|gs)\)|\b(?:enfant|b[ée]b[ée]|toddler|infant|kids?)\b/i.test(
    title,
  );
}

const TAG = 'bestseller';

const PRODUCTS = `
  query Products($cursor: String, $query: String) {
    products(first: 50, after: $cursor, query: $query) {
      pageInfo { hasNextPage endCursor }
      nodes { id title productType tags }
    }
  }
`;

const SET_TAGS = `
  mutation Tags($id: ID!, $tags: [String!]!) {
    productUpdate(product: {id: $id, tags: $tags}) {
      product { id }
      userErrors { field message }
    }
  }
`;

async function fetchAll(query) {
  const out = [];
  let cursor = null;
  for (;;) {
    const data = await gql(PRODUCTS, {cursor, query});
    out.push(...data.products.nodes);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }
  return out;
}

async function main() {
  console.log(
    `\nBestseller tags  (${APPLY ? 'APPLY' : 'DRY RUN'}, collab ${COLLAB}, ` +
      `${ESSENTIALS_CAP} Essentials sets)\n`,
  );

  const plan = new Map(); // id -> {title, tags, action, reason}

  const queue = (product, tags, action, reason) => {
    plan.set(product.id, {title: product.title, tags, action, reason});
  };

  // -- 1. kids currently tagged --------------------------------------------
  if (SWEEP_KIDS) {
    const tagged = await fetchAll(`tag:${TAG}`);
    const kids = tagged.filter((p) => isKidsProduct(p.title));
    console.log(`  tagged today            : ${tagged.length}`);
    console.log(`  of those, kids products : ${kids.length}`);
    for (const product of kids) {
      queue(
        product,
        product.tags.filter((t) => t !== TAG),
        'remove',
        'kids sizing',
      );
    }
  }

  // -- 2. adult sneakers for the collab ------------------------------------
  const collab = await fetchAll(`tag:'collab:${COLLAB}' AND product_type:sneakers`);
  const adults = collab.filter(
    (p) => !isKidsProduct(p.title) && !p.tags.includes(TAG),
  );
  console.log(`\n  ${COLLAB} sneakers        : ${collab.length}`);
  console.log(`  adult, untagged         : ${adults.length}`);
  for (const product of adults) {
    queue(product, [...product.tags, TAG], 'add', `adult ${COLLAB}`);
  }

  // -- 3. Essentials sets ---------------------------------------------------
  if (ESSENTIALS_CAP > 0) {
    const sets = await fetchAll(
      `tag:'brand:essentials' AND (product_type:Tracksuits OR product_type:Sets)`,
    );
    const untagged = sets.filter(
      (p) => !p.tags.includes(TAG) && !isKidsProduct(p.title),
    );
    // Alphabetical so a re-run picks the same ones rather than a fresh dozen.
    untagged.sort((a, b) => a.title.localeCompare(b.title));
    const picked = untagged.slice(0, ESSENTIALS_CAP);
    console.log(`\n  Essentials sets         : ${sets.length}`);
    console.log(`  untagged                : ${untagged.length}`);
    console.log(`  tagging                 : ${picked.length}`);
    for (const product of picked) {
      queue(product, [...product.tags, TAG], 'add', 'Essentials set');
    }
  }

  // -- write ----------------------------------------------------------------
  const rows = [['title', 'action', 'reason']];
  let added = 0;
  let removed = 0;
  let failed = 0;

  for (const [id, entry] of plan) {
    rows.push([entry.title, entry.action, entry.reason]);
    if (entry.action === 'add') added += 1;
    else removed += 1;
    if (!APPLY) continue;
    try {
      const data = await gql(SET_TAGS, {id, tags: entry.tags});
      const errors = data.productUpdate.userErrors;
      if (errors.length) {
        failed += 1;
        console.error(`  ✗ ${entry.title}: ${errors[0].message}`);
      }
    } catch (error) {
      failed += 1;
      console.error(`  ✗ ${entry.title}: ${error.message}`);
    }
    await sleep(220);
  }

  console.log(`\n  to add                  : ${added}`);
  console.log(`  to remove               : ${removed}`);
  if (APPLY) console.log(`  failed                  : ${failed}`);

  writeFileSync(
    'bestseller-tags-report.csv',
    rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n'),
  );
  console.log('\nWrote bestseller-tags-report.csv');
  if (!APPLY) console.log('Dry run — nothing written. Re-run with --apply.\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
