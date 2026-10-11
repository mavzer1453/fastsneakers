#!/usr/bin/env node
/**
 * Delete the duplicate variant where two size grids describe one shoe.
 *
 * Two cases, same disease. Both only ever delete a variant with zero stock
 * whose twin is already on the product.
 *
 * `normalize-size-fractions.mjs` collapses every third onto the half, so
 * "35 1/3 EU" wants to become "35.5 EU". On most adidas products a "35.5 EU"
 * variant is already sitting there — same SKU, no stock, also orderable — so
 * the rename would merge two variants and the fractions script skips it. The
 * product then keeps its fraction, which is the thing we were removing.
 *
 * They are one shoe listed twice. This deletes one of them.
 *
 * CASE 1 — a third and a half for the same shoe
 *
 * WHICH ONE, AND WHY NOT THE OTHER
 *
 * It deletes the FRACTION and keeps the existing "X.5".
 *
 * The obvious answer is the reverse — on an adidas grid 35 1/3 is the real
 * size and 35.5 is the feed artifact, so delete the artifact. That reasoning
 * only holds for adidas. The catalogue also has Nike and Jordan products
 * carrying BOTH grids merged: "Air Jordan 1 Mid Sky J Mauve" lists 36.5 and
 * 36 2/3, 37.5 and 37 1/3, 38.5 and 38 2/3 side by side. There the half is
 * the real Nike size and the third is the artifact. So "delete the artifact"
 * has no single answer, and guessing per brand is how you delete the wrong
 * variant.
 *
 * Keeping the half is right either way:
 *
 *   - Both variants end up labelled "X.5" regardless, so the shopper sees
 *     the same thing.
 *   - The half needs no rename, so there is one operation instead of two.
 *   - Its variant id is the one Merchant Center, Meta and GA4 have already
 *     seen. Fractional variants were never cleanly indexed. Keeping it
 *     preserves the id those systems know.
 *
 * SAFETY
 *
 * Only deletes when the variant has zero inventory AND a variant with the
 * post-rename name already exists on the same product. Anything with stock
 * is reported and skipped.
 *
 * **Deleting a variant cannot be undone by the report.** Shopify will not
 * recreate a variant with its original id, so the CSV this writes is a
 * record, not a rollback. Read the dry run properly.
 *
 * CASE 2 — US kids sizes wearing an EU label
 *
 * The kids Dunks and Air Force 1s carry "1 EU", "2.5 EU", "11 EU", "13.5 EU"
 * alongside "27.5 EU" through "35 EU". The first set is US kids sizing with
 * an EU suffix stuck on by the importer; the second is the real EU grid for
 * the same shoe, same SKU, same zero stock. No EU shoe size is below 16, so
 * anything under that on a product which ALSO carries proper EU values is
 * the mislabelled copy. Seventeen products.
 *
 * The guard matters: a product with ONLY sub-16 values is left alone, since
 * deleting those would leave it with no sizes at all.
 *
 * Run this BEFORE normalize-size-fractions.mjs; afterwards that script has
 * no collisions left to skip.
 *
 * Usage:
 *   node scripts/dedupe-size-duplicates.mjs            # dry run + report
 *   node scripts/dedupe-size-duplicates.mjs --apply
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

if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET in .env');
  process.exit(1);
}

const {gql} = createAdminClient({
  shop: SHOP,
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
});

// ------------------------------------------------------------ the mapping --

/** "38 2/3 EU" -> "38.5 EU"; anything else -> null. Mirrors the fractions script. */
export function halfName(value) {
  const raw = (value ?? '').trim();
  const cleaned = raw.replace(/\([^)]*\)\s*$/, '').trim();

  let base = null;
  const fraction = /^(\d{1,2})\s+([12])\s*\/\s*([23])\s*(?:eur?)?$/i.exec(cleaned);
  if (fraction && Number(fraction[2]) < Number(fraction[3])) {
    base = Number(fraction[1]);
  } else {
    const decimal = /^(\d{1,2})[.,](\d{2})\s*(?:eur?)?$/i.exec(cleaned);
    if (decimal) {
      const part = Number(`0.${decimal[2]}`);
      const isThird = Math.abs(part - 1 / 3) < 0.02;
      const isTwoThirds = Math.abs(part - 2 / 3) < 0.02;
      if (isThird || isTwoThirds) base = Number(decimal[1]);
    }
  }
  if (base === null) return null;

  const suffix = /\beur?\b/i.test(raw) ? ' EU' : '';
  const marker = /\(([^)]*)\)\s*$/.exec(raw);
  return `${base + 0.5}${suffix}${marker ? ` (${marker[1]})` : ''}`;
}


/**
 * The numeric part of an EU size value, or null when it is not a plain
 * number ("XXS", "140CM", "36-37 EU", "Default Title" all return null).
 */
function sizeNumber(value) {
  const cleaned = (value ?? '').trim().replace(/\([^)]*\)\s*$/, '').trim();
  const match = /^(\d{1,2}(?:[.,]\d)?)\s*(?:eur?)?$/i.exec(cleaned);
  return match ? Number(match[1].replace(',', '.')) : null;
}

/** No EU shoe size is below this. Anything under it is another grid. */
const MIN_EU = 16;

// ----------------------------------------------------------------- queries --

const SCAN = `
  query Scan($cursor: String) {
    products(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        title
        options(first: 5) { name optionValues { name } }
      }
    }
  }
`;

const VARIANTS = `
  query Variants($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        handle
        title
        variants(first: 100) {
          nodes { id title sku inventoryQuantity }
        }
      }
    }
  }
`;

const DELETE = `
  mutation DeleteVariants($productId: ID!, $variantsIds: [ID!]!) {
    productVariantsBulkDelete(productId: $productId, variantsIds: $variantsIds) {
      userErrors { field message }
    }
  }
`;

// ------------------------------------------------------------------ main ---

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

async function main() {
  console.log(`\nDuplicate size variants  (${APPLY ? 'APPLY' : 'DRY RUN'})\n`);

  // Pass 1 — cheap scan for products where a third would land on an existing
  // half. Only those need their variants fetched.
  const suspects = [];
  let cursor = null;
  let scanned = 0;
  for (;;) {
    const data = await gql(SCAN, {cursor});
    for (const product of data.products.nodes) {
      scanned += 1;
      for (const option of product.options ?? []) {
        if (!/^size$/i.test((option.name ?? '').trim())) continue;
        const names = new Set(
          (option.optionValues ?? []).map((v) => (v.name ?? '').trim()),
        );
        // Case 1: a third whose half is already present.
        const clashing = [...names].map((n) => {
          const half = halfName(n);
          return half && names.has(half) ? {name: n, keeps: half, reason: 'third'} : null;
        }).filter(Boolean);

        // Case 2: US kids sizing wearing an EU label, on a product that also
        // carries the real EU grid. Without that second condition we would
        // strip every size off a genuinely US-sized product.
        const numbers = [...names]
          .map((n) => ({name: n, n: sizeNumber(n)}))
          .filter((v) => v.n !== null);
        const hasRealEu = numbers.some((v) => v.n >= 20);
        if (hasRealEu) {
          for (const v of numbers) {
            if (v.n < MIN_EU) {
              clashing.push({name: v.name, keeps: 'the EU grid', reason: 'us-kids'});
            }
          }
        }

        if (clashing.length) suspects.push({product, clashing});
      }
    }
    process.stdout.write(`\r  scanned ${scanned}`);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }
  process.stdout.write(`\r  scanned ${scanned} products\n`);
  console.log(`  products with a duplicate : ${suspects.length}`);

  if (!suspects.length) {
    console.log('\nNothing to do.\n');
    return;
  }

  // Pass 2 — variants, for the suspects only.
  const plan = [];
  const withStock = [];
  for (let i = 0; i < suspects.length; i += 20) {
    const batch = suspects.slice(i, i + 20);
    const data = await gql(VARIANTS, {ids: batch.map((s) => s.product.id)});
    for (const node of data.nodes) {
      if (!node) continue;
      const suspect = batch.find((s) => s.product.id === node.id);
      const byTitle = new Map(
        node.variants.nodes.map((v) => [(v.title ?? '').trim(), v]),
      );
      const doomed = [];
      for (const clash of suspect.clashing) {
        const variant = byTitle.get(clash.name);
        if (!variant) continue;
        // A third must have its half actually present as a variant; the
        // us-kids case was already proven against the whole option.
        if (clash.reason === 'third' && !byTitle.get(clash.keeps)) continue;
        if ((variant.inventoryQuantity ?? 0) !== 0) {
          withStock.push(
            `${node.handle}: "${clash.name}" has ${variant.inventoryQuantity} in stock — skipped`,
          );
          continue;
        }
        doomed.push({
          id: variant.id,
          name: clash.name,
          keeps: clash.keeps,
          reason: clash.reason,
          sku: variant.sku,
        });
      }
      if (doomed.length) {
        plan.push({id: node.id, handle: node.handle, title: node.title, doomed});
      }
    }
    process.stdout.write(`\r  inspected ${Math.min(i + 20, suspects.length)}/${suspects.length}`);
  }
  process.stdout.write('\n');

  const total = plan.reduce((n, p) => n + p.doomed.length, 0);
  const byReason = (r) =>
    plan.reduce((n, p) => n + p.doomed.filter((d) => d.reason === r).length, 0);
  console.log(`\n  variants to delete : ${total} across ${plan.length} products`);
  console.log(`    thirds           : ${byReason('third')}`);
  console.log(`    US kids as EU    : ${byReason('us-kids')}`);
  console.log(`  skipped, in stock  : ${withStock.length}`);

  for (const item of plan.slice(0, 3)) {
    console.log(`\n  ${item.title}`);
    for (const d of item.doomed.slice(0, 5)) {
      console.log(`    delete ${d.name.padEnd(14)} keeping ${d.keeps.padEnd(16)} (${d.reason})`);
    }
  }

  writeFileSync(
    new URL('../size-duplicates-report.csv', import.meta.url),
    ['handle,title,reason,deleted_variant_id,deleted_name,kept_name,sku']
      .concat(
        plan.flatMap((p) =>
          p.doomed.map((d) =>
            [p.handle, p.title, d.reason, d.id, d.name, d.keeps, d.sku]
              .map(csvCell)
              .join(','),
          ),
        ),
      )
      .join('\n') + '\n',
  );
  console.log('\nWrote size-duplicates-report.csv');
  if (withStock.length) {
    writeFileSync(
      new URL('../size-duplicates-skipped.txt', import.meta.url),
      withStock.join('\n') + '\n',
    );
    console.log('Wrote size-duplicates-skipped.txt');
  }

  if (!APPLY) {
    console.log('\nDry run. Deleting a variant is PERMANENT — read the report first.\n');
    return;
  }

  let done = 0;
  const failures = [];
  for (const item of plan) {
    try {
      const data = await gql(DELETE, {
        productId: item.id,
        variantsIds: item.doomed.map((d) => d.id),
      });
      const errs = data.productVariantsBulkDelete.userErrors;
      if (errs.length) failures.push(`${item.handle}: ${errs.map((e) => e.message).join('; ')}`);
    } catch (error) {
      failures.push(`${item.handle}: ${error.message}`);
    }
    process.stdout.write(`\r  deleted ${++done}/${plan.length} products`);
  }
  process.stdout.write('\n');

  console.log(`\nDone. ${total} variants deleted, ${failures.length} products failed.`);
  for (const f of failures.slice(0, 10)) console.log(`  ! ${f}`);
  console.log('\nNow run: node scripts/normalize-size-fractions.mjs\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
