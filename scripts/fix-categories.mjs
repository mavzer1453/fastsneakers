#!/usr/bin/env node
/**
 * Re-derive product_type and our managed tags for products already in the store.
 *
 * Why this exists: the catalogue was imported before the taxonomy settled, so
 * boots and slippers sit under product_type "sneakers", colour tags are missing
 * on roughly a quarter of products, and nothing carries the sub-model tags the
 * new sub-collections need (model:nike-dunk-low and friends).
 *
 * It only ever rewrites what we manage:
 *   - product_type
 *   - tags prefixed color: / brand: / model: / size:
 * Everything else on the product — title, description, images, price,
 * inventory, and any hand-added tag like `bestseller` or `FREESHIPPING` — is
 * left exactly as it is.
 *
 * Usage (credentials from .env, same as the other scripts):
 *   node scripts/fix-categories.mjs                 # dry run + fix-categories-report.csv
 *   node scripts/fix-categories.mjs --apply         # write the changes
 *   node scripts/fix-categories.mjs --apply --limit=50
 *   node scripts/fix-categories.mjs --types-only    # product_type changes, leave tags alone
 *   node scripts/fix-categories.mjs --tags-only     # tags only, leave product_type alone
 *   node scripts/fix-categories.mjs --keep-sizes    # never touch size: tags (see KEEP_SIZES)
 *
 * Vendor:
 *   --vendors                       set the real manufacturer where the legacy
 *                                   "EasyHairKit" placeholder is still in place
 *   --vendor="Fast Sneakers"  set every product to one house value
 */

import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {URLSearchParams} from 'node:url';
import {
  brandLabel,
  brandOf,
  classify,
  collabTags,
  colorTags,
  mergeTags,
  modelTags,
  typeTag,
  vendorBrandOf,
} from './lib/taxonomy.mjs';

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
const TYPES_ONLY = process.argv.includes('--types-only');
const TAGS_ONLY = process.argv.includes('--tags-only');
/**
 * Leave `size:` tags exactly as they are.
 *
 * This script used to own them, but the September size clean-up moved that to
 * normalize-size-values / normalize-size-fractions / sync-size-tags, which
 * collapse thirds onto halves and drop junk values. sizeTags() here still
 * derives the OLD shape, so a plain run now wants to rewrite size tags on
 * ~1,100 products and undo that work. Pass this whenever the run is about
 * type, brand or model.
 */
const KEEP_SIZES = process.argv.includes('--keep-sizes');
/**
 * Vendor handling, two mutually exclusive modes:
 *
 *   --vendors            derive the real manufacturer (Nike, Air Jordan, UGG)
 *                        and use it wherever the legacy placeholder is still set
 *   --vendor="Name"      set every product to one literal value
 *
 * The second is a deliberate house-brand choice. Note that Shopify's vendor
 * feeds the `brand` field in the Google and Meta catalogues, so a uniform value
 * weakens catalogue matching there; the storefront's own brand filter is
 * tag-driven and unaffected either way.
 */
const FIX_VENDORS = process.argv.includes('--vendors');
const VENDOR_LITERAL = (process.argv.find((a) => a.startsWith('--vendor=')) ?? '').slice(9);
/** The placeholder the catalogue was originally imported with. */
const PLACEHOLDER_VENDOR = /^(easyhairkit|)$/i;
const LIMIT = Number.parseInt(
  (process.argv.find((a) => a.startsWith('--limit=')) ?? '').slice(8),
  10,
);
const API_VERSION = '2025-07';

if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET in .env');
  process.exit(1);
}

// ------------------------------------------------------------- admin api ---

const ENDPOINT = `https://${SHOP}.myshopify.com/admin/api/${API_VERSION}/graphql.json`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let token = null;
let tokenExpiresAt = 0;

async function getToken() {
  if (token && Date.now() < tokenExpiresAt - 60_000) return token;
  const res = await fetch(`https://${SHOP}.myshopify.com/admin/oauth/access_token`, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`Token request failed (${res.status})`);
  const {access_token, expires_in, scope} = await res.json();
  if (!/write_products/.test(scope ?? '')) {
    throw new Error(`App lacks write_products (granted: ${scope || 'none'})`);
  }
  token = access_token;
  tokenExpiresAt = Date.now() + expires_in * 1000;
  return token;
}

async function admin(query, variables = {}, attempt = 0) {
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'X-Shopify-Access-Token': await getToken()},
      body: JSON.stringify({query, variables}),
    });
  } catch (error) {
    if (attempt >= 6) throw error;
    await sleep(2000 * (attempt + 1));
    return admin(query, variables, attempt + 1);
  }
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 6) throw new Error(`Admin API ${res.status}`);
    await sleep(2000 * (attempt + 1));
    return admin(query, variables, attempt + 1);
  }
  const json = await res.json();
  if (json.errors) {
    if (json.errors.some((e) => e.extensions?.code === 'THROTTLED') && attempt < 6) {
      await sleep(2000 * (attempt + 1));
      return admin(query, variables, attempt + 1);
    }
    throw new Error(`GraphQL: ${JSON.stringify(json.errors).slice(0, 300)}`);
  }
  const throttle = json.extensions?.cost?.throttleStatus;
  if (throttle && throttle.currentlyAvailable < 300) await sleep(1000);
  return json.data;
}

const PRODUCTS_QUERY = `
  query Products($cursor: String) {
    products(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        title
        vendor
        productType
        tags
        options(first: 3) { name optionValues { name } }
      }
    }
  }
`;

async function fetchProducts() {
  const out = [];
  let cursor = null;
  for (;;) {
    const data = await admin(PRODUCTS_QUERY, {cursor});
    out.push(...data.products.nodes);
    process.stdout.write(`\r  loaded ${out.length} products`);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }
  process.stdout.write('\n');
  return out;
}

// ------------------------------------------------------------- the rules ---

/** Size option values become size: tags, matching the existing convention. */
function sizeTags(product) {
  const sizeOption = product.options.find((o) =>
    /size|maat|mate|schoenmaat|größe/i.test(o.name),
  );
  if (!sizeOption) return [];
  return sizeOption.optionValues.map((v) => `size:${v.name.replace(/\s*EU$/i, '').trim()}`);
}

function plan(products) {
  const changes = [];
  const stats = {
    typeOnly: 0,
    tagsOnly: 0,
    both: 0,
    vendorChanged: 0,
    unchanged: 0,
    unclassifiable: [],
  };

  for (const p of products) {
    // Pass the current type as the seller type: it already settles
    // footwear-vs-apparel, and only the finer split is re-derived.
    const newType = classify({
      title: p.title,
      vendor: p.vendor,
      sourceType: p.productType,
    });

    const brand = brandOf(p);
    const derived = [
      ...colorTags(p.title),
      brand ? `brand:${brand}` : null,
      ...modelTags(p.title),
      ...collabTags(p.title),
      typeTag(newType ?? p.productType),
      ...(KEEP_SIZES
        ? (p.tags ?? []).filter((tag) => tag.startsWith('size:'))
        : sizeTags(p)),
    ].filter(Boolean);
    const newTags = mergeTags(p.tags, derived);

    // --vendor="Name" sets everything; --vendors only replaces the placeholder,
    // leaving real brands (which the import already set) alone.
    const newVendor = VENDOR_LITERAL || brandLabel(vendorBrandOf(p));
    const vendorChanged = VENDOR_LITERAL
      ? newVendor !== p.vendor
      : FIX_VENDORS &&
        !!newVendor &&
        PLACEHOLDER_VENDOR.test((p.vendor ?? '').trim()) &&
        newVendor !== p.vendor;

    const typeChanged = !TAGS_ONLY && newType && newType !== p.productType;
    const tagsChanged =
      !TYPES_ONLY && JSON.stringify(newTags) !== JSON.stringify([...p.tags].sort());

    if (!newType) stats.unclassifiable.push(`${p.title} [${p.productType}]`);
    if (!typeChanged && !tagsChanged && !vendorChanged) {
      stats.unchanged++;
      continue;
    }

    if (vendorChanged) stats.vendorChanged++;
    if (typeChanged && tagsChanged) stats.both++;
    else if (typeChanged) stats.typeOnly++;
    else if (tagsChanged) stats.tagsOnly++;

    changes.push({
      id: p.id,
      handle: p.handle,
      title: p.title,
      fromType: p.productType,
      toType: typeChanged ? newType : p.productType,
      typeChanged,
      fromVendor: p.vendor,
      toVendor: newVendor,
      vendorChanged,
      addedTags: newTags.filter((t) => !p.tags.includes(t)),
      removedTags: p.tags.filter((t) => !newTags.includes(t)),
      tags: newTags,
      tagsChanged,
    });
  }

  return {changes, stats};
}

// ----------------------------------------------------------------- apply ---

const UPDATE = `
  mutation Fix($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      userErrors { field message }
    }
  }
`;

async function applyChanges(changes) {
  const failures = [];
  let done = 0;

  for (const c of changes) {
    const input = {id: c.id};
    if (c.typeChanged) input.productType = c.toType;
    if (c.tagsChanged) input.tags = c.tags;
    if (c.vendorChanged) input.vendor = c.toVendor;

    try {
      const data = await admin(UPDATE, {product: input});
      const errs = data.productUpdate.userErrors;
      if (errs.length) failures.push(`${c.handle}: ${errs.map((e) => e.message).join('; ')}`);
    } catch (error) {
      failures.push(`${c.handle}: ${error.message}`);
    }

    done++;
    if (done % 20 === 0 || done === changes.length) {
      process.stdout.write(`\r  updated ${done}/${changes.length}`);
    }
  }

  process.stdout.write('\n');
  return failures;
}

// ------------------------------------------------------------------ main ---

const csvCell = (v) => `"${String(v).replace(/"/g, '""')}"`;

async function main() {
  const mode = TYPES_ONLY ? 'types only' : TAGS_ONLY ? 'tags only' : 'types + tags';
  console.log(`\nFix categories  (${APPLY ? 'APPLY' : 'DRY RUN'}, ${mode})\n`);

  const products = await fetchProducts();
  const {changes, stats} = plan(products);

  const typeMoves = {};
  for (const c of changes) {
    if (!c.typeChanged) continue;
    const key = `${c.fromType || '(none)'} -> ${c.toType}`;
    typeMoves[key] = (typeMoves[key] ?? 0) + 1;
  }

  console.log(`\n  products scanned  : ${products.length}`);
  console.log(`  already correct   : ${stats.unchanged}`);
  console.log(`  needs changes     : ${changes.length}`);
  console.log(`    type only       : ${stats.typeOnly}`);
  console.log(`    tags only       : ${stats.tagsOnly}`);
  console.log(`    both            : ${stats.both}`);

  if (Object.keys(typeMoves).length) {
    console.log('\nCategory moves');
    for (const [move, n] of Object.entries(typeMoves).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${move.padEnd(28)} ${n}`);
    }
  }

  if (FIX_VENDORS || VENDOR_LITERAL) {
    const vendorMoves = {};
    for (const c of changes) {
      if (!c.vendorChanged) continue;
      vendorMoves[c.toVendor] = (vendorMoves[c.toVendor] ?? 0) + 1;
    }
    console.log(`\nVendor -> real brand (${stats.vendorChanged} products)`);
    for (const [brand, n] of Object.entries(vendorMoves).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
      console.log(`  ${brand.padEnd(24)} ${n}`);
    }
  }

  const newColour = changes.filter((c) => c.addedTags.some((t) => t.startsWith('color:'))).length;
  const newModel = changes.filter((c) => c.addedTags.some((t) => t.startsWith('model:'))).length;
  console.log(`\n  gaining a colour tag : ${newColour}`);
  console.log(`  gaining a model tag  : ${newModel}`);
  if (stats.unclassifiable.length) {
    console.log(`  couldn't classify    : ${stats.unclassifiable.length} (left as-is)`);
  }

  const report = [
    ['handle', 'title', 'from_type', 'to_type', 'to_vendor', 'added_tags', 'removed_tags'].join(','),
    ...changes.map((c) =>
      [
        c.handle,
        c.title,
        c.fromType,
        c.typeChanged ? c.toType : '',
        c.vendorChanged ? c.toVendor : '',
        c.addedTags.join(' '),
        c.removedTags.join(' '),
      ]
        .map(csvCell)
        .join(','),
    ),
  ].join('\n');
  writeFileSync(new URL('../fix-categories-report.csv', import.meta.url), report + '\n');
  console.log('\nWrote fix-categories-report.csv');

  const batch = Number.isFinite(LIMIT) ? changes.slice(0, LIMIT) : changes;

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply.\n');
    return;
  }

  console.log(`\nApplying ${batch.length} updates...`);
  const failures = await applyChanges(batch);

  if (failures.length) {
    console.log(`\n${failures.length} failed:`);
    for (const f of failures.slice(0, 20)) console.log(`  ${f}`);
    process.exitCode = 1;
  } else {
    console.log('\nDone.\n');
  }
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
