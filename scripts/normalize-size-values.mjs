#!/usr/bin/env node
/**
 * Clean the Size option VALUES so the storefront size filter is usable.
 *
 * Turning on the Search & Discovery filter for the `Size` product option
 * produced 261 distinct values. A filter with 261 checkboxes is a list, not
 * a filter. This removes the two kinds of noise that are provably safe to
 * remove, and deliberately leaves the rest alone.
 *
 * WHAT THIS CHANGES
 *
 *   1. Case. The catalogue carries both "S" and "s", "M" and "m", "XL" and
 *      "xl". Shopify treats those as different values, so the filter lists
 *      each twice and a shopper who picks one misses the other's products.
 *      Uppercased to the canonical form.
 *
 *   2. `Default Title` sitting under an option named "Size". These are
 *      single-variant products — bracelets, sunglasses, cardholders — whose
 *      option got renamed to "Size" along with everything else. The product
 *      has no size, so the fix is to put the option name back to Shopify's
 *      single-variant convention ("Title"), which drops it out of the size
 *      filter entirely and removes the pointless one-entry size picker from
 *      the product page. The VALUE is never touched.
 *
 * WHAT THIS DELIBERATELY DOES NOT TOUCH, AND WHY
 *
 *   `38 EU (Breed)`, `35 EU (N)` — "breed" is Dutch for wide. These are real
 *      width variants and they COEXIST with their base size on the same
 *      product: Timberland 6" Boot carries both "38 EU" and "38 EU (Breed)"
 *      as separate variants. Stripping the suffix would collide with the
 *      value already there and cost a sellable variant. They belong in a
 *      Search & Discovery filter GROUP, not in a rename.
 *
 *   `XXS PRE-ORDER` — a pre-order variant. The marker carries meaning.
 *
 *   `140CM`, `100CM`, `105CM` — belt and lace lengths, correctly sized.
 *
 *   `34-38`, `36-37 EU` … `52-53 EU` — sock and slipper ranges, correct.
 *
 *   Fractional sizes — `normalize-size-fractions.mjs` owns those.
 *
 * Renaming an option value renames its variants. Orders already placed keep
 * their own line-item snapshots, so history is not rewritten.
 *
 * Usage:
 *   node scripts/normalize-size-values.mjs                       # dry run + report
 *   node scripts/normalize-size-values.mjs --apply --limit=1     # one product
 *   node scripts/normalize-size-values.mjs --apply
 *   node scripts/normalize-size-values.mjs --rollback=size-values-rollback-<stamp>.csv
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
 * Canonical spelling of an apparel size, or null when the value is not one.
 *
 * Anchored deliberately. "38 EU" is not an apparel size, "XXS PRE-ORDER" is
 * not a bare size, and "S/M" is a real combined size that must keep its
 * slash. Anything this does not recognise is left exactly as it is.
 */
const APPAREL = /^(xxxs|xxs|xs|s|m|l|xl|xxl|xxxl|xxxxl|[2-5]xl)$/i;

export function canonicalSize(value) {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;

  const parts = trimmed.split('/');
  if (!parts.every((part) => APPAREL.test(part.trim()))) return null;

  const canonical = parts.map((part) => part.trim().toUpperCase()).join('/');
  // Compare against the RAW value, not the trimmed one: "  M  " is a distinct
  // option value in Shopify and lists separately in the filter, so the stray
  // whitespace is itself worth fixing.
  return canonical === value ? null : canonical;
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
        options(first: 5) {
          id
          name
          optionValues { id name }
        }
      }
    }
  }
`;

const UPDATE = `
  mutation UpdateOption(
    $productId: ID!
    $option: OptionUpdateInput!
    $values: [OptionValueUpdateInput!]
  ) {
    productOptionUpdate(
      productId: $productId
      option: $option
      optionValuesToUpdate: $values
      variantStrategy: LEAVE_AS_IS
    ) {
      userErrors { field message code }
    }
  }
`;

// -------------------------------------------------------------- planning ---

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function planFor(product) {
  const plans = [];
  const collisions = [];

  for (const option of product.options ?? []) {
    if (!IS_SIZE_OPTION(option.name)) continue;
    const values = option.optionValues ?? [];

    // Case 2: a "Size" option whose only value is Shopify's placeholder.
    // The product has no size; put the option name back.
    if (values.length === 1 && /^default title$/i.test(values[0].name ?? '')) {
      plans.push({
        kind: 'option-name',
        optionId: option.id,
        from: option.name,
        to: 'Title',
      });
      continue;
    }

    // Case 1: canonical casing, skipping any product where the canonical
    // form is already present — renaming into it would merge two variants.
    const present = new Set(values.map((v) => (v.name ?? '').trim()));
    const changes = [];
    for (const value of values) {
      const next = canonicalSize(value.name);
      if (!next) continue;
      if (present.has(next)) {
        collisions.push(
          `${product.handle}: "${value.name}" -> "${next}" already exists`,
        );
        continue;
      }
      changes.push({id: value.id, from: value.name, to: next});
    }
    if (changes.length) {
      plans.push({kind: 'value-case', optionId: option.id, changes});
    }
  }

  return {plans, collisions};
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

async function applyPlan(item) {
  const variables =
    item.kind === 'option-name'
      ? {productId: item.id, option: {id: item.optionId, name: item.to}}
      : {
          productId: item.id,
          option: {id: item.optionId},
          values: item.changes.map((c) => ({id: c.id, name: c.to})),
        };
  const data = await gql(UPDATE, variables);
  const errs = data.productOptionUpdate.userErrors;
  if (errs.length) throw new Error(errs.map((e) => e.message).join('; '));
}

async function runRollback(path) {
  const rows = readFileSync(path, 'utf8').trim().split('\n').slice(1);
  const items = [];
  for (const row of rows) {
    const cells = (row.match(/"((?:[^"]|"")*)"/g) ?? []).map((c) =>
      c.slice(1, -1).replace(/""/g, '"'),
    );
    const [, productId, optionId, kind, valueId, from] = cells;
    if (kind === 'option-name') {
      items.push({kind, id: productId, optionId, to: from});
    } else {
      const existing = items.find(
        (i) => i.kind === 'value-case' && i.optionId === optionId,
      );
      const change = {id: valueId, to: from};
      if (existing) existing.changes.push(change);
      else
        items.push({
          kind: 'value-case',
          id: productId,
          optionId,
          changes: [change],
        });
    }
  }
  console.log(`Reverting ${items.length} option updates from ${path}`);
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

  console.log(`\nSize option values -> canonical  (${APPLY ? 'APPLY' : 'DRY RUN'})\n`);

  const products = await loadProducts();

  const plan = [];
  const collisions = [];
  for (const product of products) {
    const {plans, collisions: c} = planFor(product);
    collisions.push(...c);
    for (const p of plans) {
      if (plan.length >= LIMIT) break;
      plan.push({id: product.id, handle: product.handle, title: product.title, ...p});
    }
  }

  const caseItems = plan.filter((p) => p.kind === 'value-case');
  const nameItems = plan.filter((p) => p.kind === 'option-name');
  const valueCount = caseItems.reduce((n, p) => n + p.changes.length, 0);

  console.log(`\n  case fixes         : ${caseItems.length} products, ${valueCount} values`);
  console.log(`  "Default Title"    : ${nameItems.length} options renamed Size -> Title`);
  console.log(`  skipped, collision : ${collisions.length}`);

  for (const item of caseItems.slice(0, 3)) {
    console.log(`\n  ${item.title}`);
    for (const c of item.changes.slice(0, 6)) {
      console.log(`    ${c.from.padEnd(10)} -> ${c.to}`);
    }
  }
  if (nameItems.length) {
    console.log(`\n  Size -> Title, e.g. ${nameItems.slice(0, 3).map((i) => i.title).join(', ')}`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  writeFileSync(
    new URL(`../size-values-report.csv`, import.meta.url),
    ['handle,title,kind,from,to']
      .concat(
        plan.flatMap((p) =>
          p.kind === 'option-name'
            ? [[p.handle, p.title, p.kind, p.from, p.to].map(csvCell).join(',')]
            : p.changes.map((c) =>
                [p.handle, p.title, p.kind, c.from, c.to].map(csvCell).join(','),
              ),
        ),
      )
      .join('\n') + '\n',
  );
  console.log('\nWrote size-values-report.csv');

  if (collisions.length) {
    writeFileSync(
      new URL('../size-values-collisions.txt', import.meta.url),
      collisions.join('\n') + '\n',
    );
    console.log('Wrote size-values-collisions.txt');
  }

  if (!APPLY) {
    console.log('\nDry run. Read the report, then re-run with --apply.\n');
    return;
  }

  const rollbackPath = new URL(`../size-values-rollback-${stamp}.csv`, import.meta.url);
  writeFileSync(
    rollbackPath,
    ['handle,product_id,option_id,kind,value_id,from,to']
      .concat(
        plan.flatMap((p) =>
          p.kind === 'option-name'
            ? [[p.handle, p.id, p.optionId, p.kind, '', p.from, p.to].map(csvCell).join(',')]
            : p.changes.map((c) =>
                [p.handle, p.id, p.optionId, p.kind, c.id, c.from, c.to]
                  .map(csvCell)
                  .join(','),
              ),
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

  console.log(`\nDone. ${plan.length} option updates, ${failures.length} failed.`);
  for (const f of failures.slice(0, 10)) console.log(`  ! ${f}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
