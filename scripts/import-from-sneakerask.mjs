#!/usr/bin/env node
/**
 * Import the products SneakerAsk has and we don't, as DRAFTS.
 *
 * What it does
 *   - Pulls SneakerAsk's full catalogue and our own, and imports only handles
 *     we don't already have. Nothing existing is ever touched.
 *   - Sorts each product into OUR category (product_type), derived from the
 *     title — SneakerAsk files everything as "Sneakers" or "Kleding", which is
 *     too coarse for our collections.
 *   - Builds our tag conventions: color:, brand:, model:, size:.
 *   - Prices with the same rules as scripts/reprice-sneakers.mjs.
 *   - Creates everything as DRAFT so nothing hits the storefront unreviewed.
 *
 * Collections are all smart/rule-based on product_type and title, so a correct
 * product_type means the product files itself into Sneakers, Nike, Air Max,
 * Kids, Women and so on automatically. Nothing is assigned by hand.
 *
 * Usage (credentials come from .env, same as the repricing script):
 *   node scripts/import-from-sneakerask.mjs                 # dry run + import-preview.csv
 *   node scripts/import-from-sneakerask.mjs --apply         # create the drafts
 *   node scripts/import-from-sneakerask.mjs --apply --limit=50   # small test batch first
 *   node scripts/import-from-sneakerask.mjs --lang=nl       # Dutch descriptions
 *
 * Safe to interrupt and re-run: every created handle is appended to
 * import-progress.log and skipped next time.
 */

import {appendFileSync, existsSync, readFileSync, writeFileSync} from 'node:fs';
import {URLSearchParams} from 'node:url';
import {
  EXCLUDE,
  N,
  brandOf,
  classify,
  collabTags,
  colorTags,
  modelTags,
  targetPrice,
  typeTag,
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
const LANG = (process.argv.find((a) => a.startsWith('--lang=')) ?? '').slice(7) || 'en';
const LIMIT = Number.parseInt(
  (process.argv.find((a) => a.startsWith('--limit=')) ?? '').slice(8),
  10,
);
/** e.g. --min-images=2 to import only products that have real photo coverage. */
const MIN_IMAGES = Number.parseInt(
  (process.argv.find((a) => a.startsWith('--min-images=')) ?? '').slice(13),
  10,
);

const API_VERSION = '2025-07';
const SOURCE = 'https://sneakerask.com';
const OPTION_NAME = 'Size'; // MUST stay 'Size': Google Merchant Center reads the
// variant option NAME as the `size` attribute, and normalize-options.mjs --apply
// --name="Size" renamed the whole catalogue off "Maat" on 2026-09-19. Importing
// new products under any other name re-creates the 44K "Missing size" warnings.
const PROGRESS = new URL('../import-progress.log', import.meta.url);

if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET in .env');
  process.exit(1);
}

// ------------------------------------------------- product-derived data ---

/**
 * Only real product photography.
 *
 * SneakerAsk's "guaranteed authentic" badge is a theme element, not a product
 * image — it isn't in their product feed, so it can't be imported. This is
 * belt-and-braces for anything promotional that does slip into the feed:
 * badge-ish filenames, and banner-shaped images (very wide or very tall), which
 * product shots never are.
 */
const IMAGE_EXCLUDE =
  /authentic|guarantee|garantie|legit[- _]?check|verified|badge|banner|trust|shipping|delivery|size[- _]?chart|maattabel|watermark|promo|sneakerask/i;

function usableImages(images) {
  return (images ?? [])
    .filter((im) => {
      const file = (im.src ?? '').split('/').pop().split('?')[0];
      if (IMAGE_EXCLUDE.test(file)) return false;
      if (im.width && im.height) {
        const ratio = im.width / im.height;
        if (ratio > 3 || ratio < 0.33) return false; // banner strip, not a product
      }
      return true;
    })
    .map((im) => im.src);
}

/** SneakerAsk puts "Colorway: X" and "SKU: Y" in the body. */
function metaFromBody(html) {
  const grab = (label) => {
    const m = (html ?? '').match(
      new RegExp(`${label}\\s*(?:<\\/strong>)?\\s*:?\\s*([^<\\n]+)`, 'i'),
    );
    return m ? m[1].replace(/^[:\s]+/, '').trim() : null;
  };
  const colorway = grab('Colorway');
  const sku = grab('SKU');
  return {
    // Both guards exist because the labels aren't always followed by a short
    // value — sometimes the regex runs on into prose. Shopify caps SKU at 255
    // and rejects the whole variant batch if one is over.
    sku: sku && sku.length <= 60 ? sku : null,
    colorway: colorway && colorway.length <= 60 ? colorway : null,
  };
}

// --------------------------------------------------------- descriptions ----

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The lead sentence must never say the product is gone.
 *
 * This used to read "The <title> is exclusive and no longer available
 * anywhere else. But at Vespera Collectives, yes!" — written on 8,394
 * products. "No longer available" in the opening sentence of a 200 page is
 * precisely what Google's soft-404 classifier looks for: the 2026-09-20
 * Search Console export listed 29 live, in-stock URLs as "Soft 404", and 22
 * of the 28 products among them carried that sentence when they were
 * crawled. The Dutch twin ("nergens meer te krijgen") says the same thing.
 *
 * Keep the lead about what the product IS and that it can be bought here.
 * improve-descriptions.mjs replaces this with per-product copy afterwards;
 * scripts/audit-soft404-copy.mjs checks nothing of the old shape is left.
 */
function describe(title, {sku, colorway}) {
  const lead =
    LANG === 'nl'
      ? `De ${esc(title)} — nieuw, ongedragen en in de originele verpakking. Op voorraad bij Vespera Collectives, gecontroleerd voor verzending.`
      : `The ${esc(title)} — brand new, unworn and in its original packaging. In stock at Vespera Collectives and checked before it ships.`;

  const details = [
    sku ? `<strong>SKU</strong>: ${esc(sku)}` : null,
    colorway ? `<strong>${LANG === 'nl' ? 'Kleur' : 'Colourway'}</strong>: ${esc(colorway)}` : null,
  ].filter(Boolean);

  return `<p>${lead}</p>` + (details.length ? `<p>${details.join('<br>')}</p>` : '');
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

// ------------------------------------------------------------- fetching ---

async function fetchWithRetry(url, attempt = 0) {
  const res = await fetch(url);
  if (res.ok) return res;
  if ((res.status !== 429 && res.status < 500) || attempt >= 6) {
    throw new Error(`sneakerask HTTP ${res.status}`);
  }
  const retryAfter = Number.parseInt(res.headers.get('retry-after') ?? '', 10);
  await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : 2000 * 2 ** attempt);
  return fetchWithRetry(url, attempt + 1);
}

async function fetchSource() {
  const all = [];
  for (let page = 1; page <= 100; page++) {
    if (page > 1) await sleep(600);
    const res = await fetchWithRetry(`${SOURCE}/products.json?limit=250&page=${page}`);
    const {products} = await res.json();
    if (!products.length) break;
    all.push(...products);
    process.stdout.write(`\r  sneakerask: ${all.length} products`);
  }
  process.stdout.write('\n');
  return all;
}

const HANDLES_QUERY = `
  query Handles($cursor: String) {
    products(first: 250, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { handle }
    }
  }
`;

async function fetchOwnHandles() {
  const handles = new Set();
  let cursor = null;
  for (;;) {
    const data = await admin(HANDLES_QUERY, {cursor});
    for (const n of data.products.nodes) handles.add(n.handle);
    process.stdout.write(`\r  vespera: ${handles.size} handles`);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }
  process.stdout.write('\n');
  return handles;
}

// ------------------------------------------------------------- planning ---

function priceFor(product) {
  const prices = product.variants
    .map((v) => Number.parseFloat(v.price))
    .filter((n) => Number.isFinite(n) && n > 0);
  // No price on any variant means it's out of stock everywhere: skip it.
  return targetPrice(product.title, prices.length ? Math.min(...prices) : NaN);
}

function buildPlan(source, ownHandles, alreadyDone) {
  const plan = [];
  const skipped = {have: 0, excluded: 0, unclassified: [], noPrice: [], noVariants: 0};

  for (const p of source) {
    if (ownHandles.has(p.handle) || alreadyDone.has(p.handle)) {
      skipped.have++;
      continue;
    }
    if (!p.variants?.length) {
      skipped.noVariants++;
      continue;
    }

    const productType = classify({
      title: p.title,
      vendor: p.vendor,
      sourceType: p.product_type,
    });
    if (!productType) {
      if (EXCLUDE.test(N(p.title)) || EXCLUDE.test(N(p.vendor))) skipped.excluded++;
      else skipped.unclassified.push(`${p.title} [${p.vendor}]`);
      continue;
    }

    const price = priceFor(p);
    if (!price) {
      skipped.noPrice.push(p.handle);
      continue;
    }

    const meta = metaFromBody(p.body_html);
    const brand = brandOf(p);
    const sizes = p.variants.map((v) => String(v.option1 ?? v.title).trim()).filter(Boolean);

    const tags = [
      ...colorTags(`${meta.colorway ?? ''} ${p.title}`),
      brand ? `brand:${brand}` : null,
      ...modelTags(p.title),
      ...collabTags(p.title),
      typeTag(productType),
      ...[...new Set(sizes)].map((s) => `size:${s.replace(/\s*EU$/i, '')}`),
    ].filter(Boolean);

    plan.push({
      handle: p.handle,
      title: p.title,
      productType,
      vendor: p.vendor || 'Vespera Collectives',
      price,
      tags,
      colorway: meta.colorway,
      descriptionHtml: describe(p.title, meta),
      sizes: [...new Set(sizes)],
      sku: meta.sku ?? p.variants[0]?.sku ?? '',
      images: usableImages(p.images).slice(0, 10),
    });
  }

  // Richest imagery first. SneakerAsk's newest products often ship with a single
  // photo, and they'd otherwise dominate any --limit batch. This way a test batch
  // is representative of the good stuff, and the best listings go live first.
  plan.sort((a, b) => b.images.length - a.images.length);

  return {plan, skipped};
}

// ------------------------------------------------------------- creating ---

const CREATE = `
  mutation Create($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
    productCreate(product: $product, media: $media) {
      product { id }
      userErrors { field message }
    }
  }
`;

const ADD_VARIANTS = `
  mutation AddVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(
      productId: $productId
      variants: $variants
      strategy: REMOVE_STANDALONE_VARIANT
    ) {
      userErrors { field message }
    }
  }
`;

async function createProducts(plan) {
  const failures = [];
  let done = 0;

  for (const item of plan) {
    try {
      const created = await admin(CREATE, {
        product: {
          title: item.title,
          handle: item.handle,
          descriptionHtml: item.descriptionHtml,
          productType: item.productType,
          vendor: item.vendor,
          tags: item.tags,
          status: 'DRAFT',
          productOptions: [{name: OPTION_NAME, values: item.sizes.map((v) => ({name: v}))}],
        },
        media: item.images.map((src) => ({
          originalSource: src,
          mediaContentType: 'IMAGE',
          alt: item.title,
        })),
      });

      const errs = created.productCreate.userErrors;
      if (errs.length) {
        failures.push(`${item.handle}: ${errs.map((e) => e.message).join('; ')}`);
      } else {
        const id = created.productCreate.product.id;
        const added = await admin(ADD_VARIANTS, {
          productId: id,
          variants: item.sizes.map((size) => ({
            optionValues: [{optionName: OPTION_NAME, name: size}],
            price: item.price,
            inventoryItem: {tracked: false, sku: item.sku || undefined},
            inventoryPolicy: 'CONTINUE',
          })),
        });
        const vErrs = added.productVariantsBulkCreate.userErrors;
        if (vErrs.length) failures.push(`${item.handle}: ${vErrs.map((e) => e.message).join('; ')}`);
        appendFileSync(PROGRESS, item.handle + '\n');
      }
    } catch (error) {
      failures.push(`${item.handle}: ${error.message}`);
    }

    done++;
    if (done % 5 === 0 || done === plan.length) {
      process.stdout.write(`\r  created ${done}/${plan.length}  (${failures.length} failed)`);
    }
  }

  process.stdout.write('\n');
  return failures;
}

// ----------------------------------------------------------------- main ----

const csvCell = (v) => `"${String(v).replace(/"/g, '""')}"`;

async function main() {
  console.log(`\nImport from SneakerAsk  (${APPLY ? 'APPLY' : 'DRY RUN'}, lang=${LANG})\n`);

  const alreadyDone = existsSync(PROGRESS)
    ? new Set(readFileSync(PROGRESS, 'utf8').split('\n').filter(Boolean))
    : new Set();
  if (alreadyDone.size) console.log(`  resuming: ${alreadyDone.size} already created\n`);

  const source = await fetchSource();
  const ownHandles = await fetchOwnHandles();
  const {plan, skipped} = buildPlan(source, ownHandles, alreadyDone);

  const byType = plan.reduce((a, x) => ((a[x.productType] = (a[x.productType] ?? 0) + 1), a), {});

  console.log('\nTo import, by category');
  for (const [type, n] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type.padEnd(14)} ${n}`);
  }
  console.log(`  ${'-'.repeat(20)}`);
  console.log(`  total          ${plan.length}`);
  console.log(`  variants       ${plan.reduce((n, x) => n + x.sizes.length, 0)}`);
  console.log(`  images         ${plan.reduce((n, x) => n + x.images.length, 0)}`);
  console.log(`  with a colour  ${plan.filter((x) => x.tags.some((t) => t.startsWith('color:'))).length}`);

  const imageDist = plan.reduce((a, x) => {
    const k = Math.min(x.images.length, 5);
    a[k] = (a[k] ?? 0) + 1;
    return a;
  }, {});
  console.log('\nPhotos per product (this is whatever SneakerAsk publishes)');
  for (const k of Object.keys(imageDist).sort()) {
    console.log(`  ${k === '5' ? '5+' : k} image${k === '1' ? ' ' : 's'}      ${imageDist[k]}`);
  }

  console.log('\nSkipped');
  console.log(`  already in our store : ${skipped.have}`);
  console.log(`  collectibles / toys  : ${skipped.excluded}`);
  console.log(`  couldn't categorise  : ${skipped.unclassified.length}`);
  console.log(`  no price anywhere    : ${skipped.noPrice.length}`);

  const report = [
    ['handle', 'title', 'category', 'price', 'sizes', 'images', 'colorway', 'tags'].join(','),
    ...plan.map((x) =>
      [
        x.handle,
        x.title,
        x.productType,
        x.price,
        x.sizes.length,
        x.images.length,
        x.colorway ?? '',
        x.tags.join(' '),
      ]
        .map(csvCell)
        .join(','),
    ),
  ].join('\n');
  writeFileSync(new URL('../import-preview.csv', import.meta.url), report + '\n');
  console.log('\nWrote import-preview.csv');

  if (skipped.unclassified.length) {
    writeFileSync(
      new URL('../import-unclassified.txt', import.meta.url),
      skipped.unclassified.join('\n') + '\n',
    );
    console.log('Wrote import-unclassified.txt — review these by hand if you want them');
  }

  let batch = plan;
  if (Number.isFinite(MIN_IMAGES)) {
    batch = batch.filter((x) => x.images.length >= MIN_IMAGES);
    console.log(`\nFiltered to ${batch.length} products with ${MIN_IMAGES}+ images`);
  }
  if (Number.isFinite(LIMIT)) batch = batch.slice(0, LIMIT);

  if (!APPLY) {
    console.log('\nDry run — nothing created. Re-run with --apply to create the drafts.\n');
    return;
  }

  console.log(`\nCreating ${batch.length} drafts...`);
  const failures = await createProducts(batch);

  if (failures.length) {
    writeFileSync(
      new URL('../import-failures.txt', import.meta.url),
      failures.join('\n') + '\n',
    );
    console.log(`\n${failures.length} failed — see import-failures.txt`);
    console.log('Re-running skips everything that succeeded.');
    process.exitCode = 1;
  } else {
    console.log('\nAll drafts created. Review them in Shopify, then bulk-publish.\n');
  }
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
