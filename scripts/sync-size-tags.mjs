#!/usr/bin/env node
/**
 * Rebuild every product's `size:` tags from its actual Size option values.
 *
 * WHY THIS EXISTS
 *
 * The storefront's size filter is ours, not Shopify's. `parseCollectionFilters`
 * in app/lib/filters.ts turns `?size=42` into `{tag: "size:42"}` and the facet
 * list on the collection page comes from the tag values the Storefront API
 * reports. So the size a shopper can click is a TAG — not the product option.
 *
 * Which means the September size cleanup never reached the storefront. The
 * option values are right now:
 *
 *   normalize-size-fractions  36 2/3 EU -> 36.5 EU     (106 values)
 *   dedupe-size-duplicates    deleted 19 thirds + 38 US-kids variants
 *   normalize-size-values     Xl -> XL, Size -> Title  (54 values)
 *
 * …and the tags still say `size:36 2/3`, `size:35 1/3`, `size:1`, `size:Xl`.
 * The shopper still sees fractions in the filter; picking `42.5` after a
 * rename matches nothing because no product carries that tag yet.
 *
 * WHAT IT DOES
 *
 * For every product, the desired set is one `size:<value>` per value of the
 * option named "Size", with the ` EU` suffix stripped — the convention
 * import-from-sneakerask.mjs established (`size:${s.replace(/\s*EU$/i, '')}`).
 * Tags that are not `size:` are never touched. A product whose size option
 * was renamed to "Title" (the single-variant placeholder) ends up with no
 * size tags at all, which is correct: it has no size to filter on.
 *
 * Tag case: Shopify lowercases nothing and compares tags exactly, so `size:XL`
 * and `size:xl` are two filter entries. The option values are already
 * canonical after normalize-size-values.mjs, so the tag inherits that.
 *
 * Usage:
 *   node scripts/sync-size-tags.mjs                      # dry run + report
 *   node scripts/sync-size-tags.mjs --apply --limit=5    # five products
 *   node scripts/sync-size-tags.mjs --apply
 *   node scripts/sync-size-tags.mjs --rollback=size-tags-rollback-<stamp>.csv
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
    process.env[key] = value.replace(/^["']|["']$/g, '');
  }
}

const SHOP = (process.env.SHOPIFY_SHOP || process.env.PUBLIC_STORE_DOMAIN || '')
  .trim()
  .replace(/\.myshopify\.com$/, '');
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

const APPLY = process.argv.includes('--apply');
const LIMIT = (() => {
  const raw = process.argv.find((a) => a.startsWith('--limit='));
  const n = raw ? Number.parseInt(raw.slice(8), 10) : NaN;
  return Number.isFinite(n) ? n : Infinity;
})();
const ROLLBACK =
  process.argv.find((a) => a.startsWith('--rollback='))?.slice(11) ?? null;

if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET in .env');
  process.exit(1);
}

const {gql} = createAdminClient({
  shop: SHOP,
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
});

// ------------------------------------------------------------ classifying --

const IS_SIZE_OPTION = (name) => /^size$/i.test((name ?? '').trim());

/**
 * The tag for one option value, or null when the value carries no size.
 *
 *   `38 EU`          -> `size:38`
 *   `L`              -> `size:L`
 *   `38 EU (Breed)`  -> `size:38`      width marker folded into the base size
 *   `ASIA M`         -> `size:M`       regional grid folded into the base size
 *   `Default Title`  -> null           Shopify's placeholder, never a size
 *
 * The two foldings are the "group the width markers so 42 EU / (Breed) / (N)
 * read as one entry" decision, done here rather than in the Search &
 * Discovery UI — because the storefront filter reads tags, not options.
 *
 * Folding is safe in a way it would NOT be on the option value: a tag is
 * product-level, so `size:38` only means "this product has a 38 of some
 * kind". The shopper picks the exact variant — regular, wide, or Asia — on
 * the product page, where the option value still says which it is, and the
 * product title still says "Asia Sizing". Without the fold the filter grows
 * a separate `38 EU (Breed)` and `ASIA M` checkbox, which is the 261-value
 * filter all over again.
 *
 * The trade to know about: an Asia-sized garment runs small, and folding it
 * into `size:M` puts it in front of a shopper who asked for M. Drop
 * ASIA_PREFIX below to undo just that half.
 */
const WIDTH_MARKER = /\s*\([^)]*\)\s*$/;
const ASIA_PREFIX = /^asia\s+/i;

export function sizeTagFor(value) {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  if (/^default title$/i.test(trimmed)) return null;
  const stripped = trimmed
    .replace(WIDTH_MARKER, '')
    .replace(/\s*EUR?$/i, '')
    .replace(ASIA_PREFIX, '')
    .trim();
  return stripped ? `size:${stripped}` : null;
}

export function desiredTags(product) {
  const wanted = new Set();
  for (const option of product.options ?? []) {
    if (!IS_SIZE_OPTION(option.name)) continue;
    for (const value of option.optionValues ?? []) {
      const tag = sizeTagFor(value.name);
      if (tag) wanted.add(tag);
    }
  }
  return wanted;
}

export function planFor(product) {
  const wanted = desiredTags(product);
  const current = new Set(
    (product.tags ?? []).filter((t) => t.toLowerCase().startsWith('size:')),
  );

  const add = [...wanted].filter((t) => !current.has(t)).sort();
  const remove = [...current].filter((t) => !wanted.has(t)).sort();
  if (!add.length && !remove.length) return null;
  return {add, remove};
}

// ----------------------------------------------------------------- queries --

const PRODUCTS = `
  query Products($cursor: String) {
    products(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        title
        tags
        options(first: 5) {
          id
          name
          optionValues { id name }
        }
      }
    }
  }
`;

const TAGS_ADD = `
  mutation Add($id: ID!, $tags: [String!]!) {
    tagsAdd(id: $id, tags: $tags) { userErrors { field message } }
  }
`;

const TAGS_REMOVE = `
  mutation Remove($id: ID!, $tags: [String!]!) {
    tagsRemove(id: $id, tags: $tags) { userErrors { field message } }
  }
`;

// -------------------------------------------------------------- executing --

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

async function applyPlan(item) {
  // Remove first. Adding then removing risks a rename like `size:Xl` ->
  // `size:XL` where Shopify's own tag normalisation makes the two collide.
  if (item.remove.length) {
    const data = await gql(TAGS_REMOVE, {id: item.id, tags: item.remove});
    const errs = data.tagsRemove.userErrors;
    if (errs.length) throw new Error(errs.map((e) => e.message).join('; '));
  }
  if (item.add.length) {
    const data = await gql(TAGS_ADD, {id: item.id, tags: item.add});
    const errs = data.tagsAdd.userErrors;
    if (errs.length) throw new Error(errs.map((e) => e.message).join('; '));
  }
}

async function loadProducts() {
  const out = [];
  let cursor = null;
  for (;;) {
    const data = await gql(PRODUCTS, {cursor});
    out.push(...data.products.nodes);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
    process.stdout.write(`\r  loaded ${out.length}`);
  }
  process.stdout.write(`\r  loaded ${out.length} products\n`);
  return out;
}

async function runRollback(path) {
  const rows = readFileSync(path, 'utf8').trim().split('\n').slice(1);
  const items = [];
  for (const row of rows) {
    const cells = (row.match(/"((?:[^"]|"")*)"/g) ?? []).map((c) =>
      c.slice(1, -1).replace(/""/g, '"'),
    );
    const [handle, id, added, removed] = cells;
    items.push({
      handle,
      id,
      // Invert: put back what was removed, take off what was added.
      add: removed ? removed.split('|').filter(Boolean) : [],
      remove: added ? added.split('|').filter(Boolean) : [],
    });
  }
  console.log(`Reverting size tags on ${items.length} products from ${path}`);
  let done = 0;
  for (const item of items) {
    await applyPlan(item);
    process.stdout.write(`\r  reverted ${++done}/${items.length}`);
  }
  process.stdout.write('\n');
}

// ------------------------------------------------------------------ main ---

async function main() {
  if (ROLLBACK) return runRollback(ROLLBACK);

  console.log(`\nsize: tags -> option values  (${APPLY ? 'APPLY' : 'DRY RUN'})\n`);

  const products = await loadProducts();

  const plan = [];
  let added = 0;
  let removed = 0;
  for (const product of products) {
    if (plan.length >= LIMIT) break;
    const change = planFor(product);
    if (!change) continue;
    added += change.add.length;
    removed += change.remove.length;
    plan.push({
      id: product.id,
      handle: product.handle,
      title: product.title,
      ...change,
    });
  }

  console.log(`\n  products to touch  : ${plan.length}`);
  console.log(`  tags to add        : ${added}`);
  console.log(`  tags to remove     : ${removed}`);

  for (const item of plan.slice(0, 3)) {
    console.log(`\n  ${item.title}`);
    if (item.remove.length) console.log(`    - ${item.remove.join(', ')}`);
    if (item.add.length) console.log(`    + ${item.add.join(', ')}`);
  }

  writeFileSync(
    new URL('../size-tags-report.csv', import.meta.url),
    ['handle,title,added,removed']
      .concat(
        plan.map((p) =>
          [p.handle, p.title, p.add.join('|'), p.remove.join('|')]
            .map(csvCell)
            .join(','),
        ),
      )
      .join('\n') + '\n',
  );
  console.log('\nWrote size-tags-report.csv');

  if (!APPLY) {
    console.log('\nDry run. Read the report, then re-run with --apply.\n');
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const rollbackPath = new URL(
    `../size-tags-rollback-${stamp}.csv`,
    import.meta.url,
  );
  writeFileSync(
    rollbackPath,
    ['handle,product_id,added,removed']
      .concat(
        plan.map((p) =>
          [p.handle, p.id, p.add.join('|'), p.remove.join('|')]
            .map(csvCell)
            .join(','),
        ),
      )
      .join('\n') + '\n',
  );
  console.log(`Wrote ${rollbackPath.pathname.split('/').pop()}`);

  let done = 0;
  const failures = [];
  for (const item of plan) {
    try {
      await applyPlan(item);
    } catch (error) {
      failures.push(`${item.handle}: ${error.message}`);
    }
    process.stdout.write(`\r  updated ${++done}/${plan.length}`);
  }
  process.stdout.write('\n');

  console.log(`\nDone. ${plan.length} products, ${failures.length} failed.`);
  for (const f of failures.slice(0, 10)) console.log(`  ! ${f}`);
}

const invoked = process.argv[1] ?? '';
if (invoked.endsWith('sync-size-tags.mjs')) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
