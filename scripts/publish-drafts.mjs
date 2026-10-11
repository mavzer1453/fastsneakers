#!/usr/bin/env node
/**
 * Take imported drafts live.
 *
 * Two things have to happen, and the Shopify admin's bulk "Set as active" only
 * does the first:
 *   1. status DRAFT -> ACTIVE
 *   2. publish to the sales channels — including "Vespera Collectives Live",
 *      which is the one the Hydrogen storefront actually reads
 *
 * Products created through the Admin API start with NO publications at all, so
 * without step 2 an active product is still invisible on the site.
 *
 * By default it publishes to exactly the channels your existing live products
 * use, so imported products behave like the rest of the catalogue.
 *
 * Usage:
 *   node scripts/publish-drafts.mjs                     # dry run: what would go live
 *   node scripts/publish-drafts.mjs --apply --limit=25  # small batch first
 *   node scripts/publish-drafts.mjs --apply             # everything
 *
 * Scope:
 *   --imported-only   only handles listed in import-progress.log (the default
 *                     is every draft in the store, which may include drafts you
 *                     made by hand)
 *   --channels="Online Store,Shop"   override the channel list
 *   --status-only     flip to ACTIVE without touching publications
 *   --include-active  also act on already-live products, so a channel can be
 *                     added after the fact
 *   --min-images=2    only products with at least N images
 *   --max-price=800   skip anything priced above N
 *   --allow-soft404-copy   publish drafts even when their description says
 *                     the product is "no longer available" / "sold out".
 *                     Held back by default: that wording on a live page is
 *                     what Google reports as a Soft 404.
 *   --collections     publish COLLECTIONS rather than products. Collections
 *                     made through the API also start on no sales channel, so
 *                     the storefront 404s on them until this runs:
 *                       node scripts/publish-drafts.mjs --apply --collections
 *
 * Adding a curated range to the ad catalogues later, once it's proven on the
 * storefront — Meta rejects imageless products and reviews branded goods, so
 * feed it a clean subset rather than everything:
 *
 *   node scripts/publish-drafts.mjs --apply --include-active \
 *     --channels="Facebook & Instagram,TikTok" --min-images=2 --max-price=800
 *
 * Resumable: publishing is idempotent, so re-running is safe.
 */

import {existsSync, readFileSync} from 'node:fs';
import {URLSearchParams} from 'node:url';
import {EXCLUDE, N} from './lib/taxonomy.mjs';
import {findSoft404Phrase} from './lib/soft404.mjs';

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
const STATUS_ONLY = process.argv.includes('--status-only');
const IMPORTED_ONLY = process.argv.includes('--imported-only');
const LIMIT = Number.parseInt(
  (process.argv.find((a) => a.startsWith('--limit=')) ?? '').slice(8),
  10,
);
const CHANNELS_ARG = (process.argv.find((a) => a.startsWith('--channels=')) ?? '').slice(11);
/**
 * Also act on products that are already ACTIVE. Needed to add a channel after
 * the fact — e.g. pushing a curated range to Facebook/TikTok once it's proven
 * on the storefront. Without this the script only ever sees drafts.
 */
const INCLUDE_ACTIVE = process.argv.includes('--include-active');
/** Escape hatch for the soft-404 copy gate below — see hasSoft404Copy. */
const ALLOW_SOFT404_COPY = process.argv.includes('--allow-soft404-copy');
/**
 * Publish COLLECTIONS instead of products.
 *
 * Collections created through the Admin API start on no sales channel at all,
 * exactly like products — so the storefront 404s on them even though they
 * exist and have products. Nothing about the collection page hints at this;
 * it just looks like the collection was never made.
 */
const COLLECTIONS = process.argv.includes('--collections');
/** Only products with at least this many images (Meta rejects imageless ones). */
const MIN_IMAGES = Number.parseInt(
  (process.argv.find((a) => a.startsWith('--min-images=')) ?? '').slice(13),
  10,
);
/** Skip products priced above this — outliers you may not want advertised. */
const MAX_PRICE = Number.parseFloat(
  (process.argv.find((a) => a.startsWith('--max-price=')) ?? '').slice(12),
);
const API_VERSION = '2025-07';

/**
 * Every channel our existing live products sit on, so the catalogue stays
 * consistent. "Vespera Collectives Live" is the Hydrogen channel the storefront
 * reads — the one that decides whether a product is visible at all.
 *
 * Narrow it per-run with --channels="..." when you want a curated subset in the
 * ad catalogues rather than everything.
 */
const DEFAULT_CHANNELS = [
  'Online Store',
  'Vespera Collectives Live',
  'Shop',
  'Facebook & Instagram',
  'TikTok',
];

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

// --------------------------------------------------------------- queries ---

const PUBLICATIONS = `{ publications(first: 25) { nodes { id name } } }`;

const DRAFTS = `
  query Drafts($cursor: String, $search: String!) {
    products(first: 100, after: $cursor, query: $search) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        title
        status
        descriptionHtml
        variantsCount { count }
        variants(first: 100) { nodes { price } }
        media(first: 1) { nodes { id } }
      }
    }
  }
`;

const ACTIVATE = `
  mutation Activate($product: ProductUpdateInput!) {
    productUpdate(product: $product) { userErrors { message } }
  }
`;

const COLLECTIONS_QUERY = `
  query Collections($cursor: String) {
    collections(first: 250, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        title
        productsCount { count }
        resourcePublicationsV2(first: 1) { nodes { isPublished } }
      }
    }
  }
`;

const PUBLISH = `
  mutation Publish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) { userErrors { message } }
  }
`;

// ----------------------------------------------------------- collections ---

async function publishCollections(channels) {
  let all = [];
  let cursor = null;
  for (;;) {
    const data = await admin(COLLECTIONS_QUERY, {cursor});
    all.push(...data.collections.nodes);
    process.stdout.write(`\r  found ${all.length} collections`);
    if (!data.collections.pageInfo.hasNextPage) break;
    cursor = data.collections.pageInfo.endCursor;
  }
  process.stdout.write('\n');

  const unpublished = all.filter((c) => c.resourcePublicationsV2.nodes.length === 0);
  const empty = unpublished.filter((c) => c.productsCount.count === 0);
  const ready = unpublished.filter((c) => c.productsCount.count > 0);

  console.log(`\n  already published : ${all.length - unpublished.length}`);
  console.log(`  to publish        : ${ready.length}`);
  if (empty.length) {
    // An empty collection publishes fine but renders as a dead end, so it's
    // held back until its rule actually matches something.
    console.log(`  held back (empty) : ${empty.length}`);
    for (const c of empty.slice(0, 10)) console.log(`      ${c.handle}`);
    if (empty.length > 10) console.log(`      ...and ${empty.length - 10} more`);
  }

  const batch = Number.isFinite(LIMIT) ? ready.slice(0, LIMIT) : ready;

  if (!APPLY) {
    console.log('\nDry run — nothing published. Re-run with --apply.\n');
    return;
  }

  const input = channels.map((c) => ({publicationId: c.id}));
  const failures = [];
  let done = 0;

  console.log(`\nPublishing ${batch.length} collections...`);
  for (const c of batch) {
    try {
      const res = await admin(PUBLISH, {id: c.id, input});
      const errs = res.publishablePublish.userErrors;
      if (errs.length) failures.push(`${c.handle}: ${errs.map((e) => e.message).join('; ')}`);
    } catch (error) {
      failures.push(`${c.handle}: ${error.message}`);
    }
    done++;
    if (done % 10 === 0 || done === batch.length) {
      process.stdout.write(`\r  published ${done}/${batch.length}  (${failures.length} failed)`);
    }
  }
  process.stdout.write('\n');

  if (failures.length) {
    console.log(`\n${failures.length} failed:`);
    for (const f of failures.slice(0, 20)) console.log(`  ${f}`);
    process.exitCode = 1;
  } else {
    console.log('\nCollections live.\n');
  }
}

// ------------------------------------------------------------------ main ---

async function main() {
  console.log(`\nPublish drafts  (${APPLY ? 'APPLY' : 'DRY RUN'})\n`);

  const wanted = CHANNELS_ARG
    ? CHANNELS_ARG.split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_CHANNELS;

  const {publications} = await admin(PUBLICATIONS);
  const channels = publications.nodes.filter((p) => wanted.includes(p.name));
  const missing = wanted.filter((n) => !channels.some((c) => c.name === n));

  if (!STATUS_ONLY) {
    console.log('Channels');
    for (const c of channels) console.log(`  ✓ ${c.name}`);
    for (const m of missing) console.log(`  ✗ ${m}  (not found on this store — skipped)`);
    if (!channels.length) {
      console.error('\nNone of the requested channels exist. Check --channels=.');
      process.exit(1);
    }
  }

  if (COLLECTIONS) return publishCollections(channels);

  const search = INCLUDE_ACTIVE ? 'status:draft OR status:active' : 'status:draft';
  let drafts = [];
  let cursor = null;
  for (;;) {
    const data = await admin(DRAFTS, {cursor, search});
    drafts.push(...data.products.nodes);
    process.stdout.write(`\r  found ${drafts.length} products`);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }
  process.stdout.write('\n');

  if (Number.isFinite(MIN_IMAGES)) {
    const before = drafts.length;
    drafts = drafts.filter((d) => d.media.nodes.length >= MIN_IMAGES);
    console.log(`  ${drafts.length} have ${MIN_IMAGES}+ image(s)  (dropped ${before - drafts.length})`);
  }
  if (Number.isFinite(MAX_PRICE)) {
    const before = drafts.length;
    drafts = drafts.filter((d) =>
      d.variants.nodes.every((v) => Number.parseFloat(v.price) <= MAX_PRICE),
    );
    console.log(`  ${drafts.length} priced at or below €${MAX_PRICE}  (dropped ${before - drafts.length})`);
  }

  if (IMPORTED_ONLY) {
    const log = new URL('../import-progress.log', import.meta.url);
    if (!existsSync(log)) {
      console.error('--imported-only needs import-progress.log, which is missing.');
      process.exit(1);
    }
    const imported = new Set(readFileSync(log, 'utf8').split('\n').filter(Boolean));
    const before = drafts.length;
    drafts = drafts.filter((d) => imported.has(d.handle));
    console.log(`  narrowed to ${drafts.length} imported (from ${before})`);
  }

  /**
   * Hold back anything priced at zero. That — not a low variant count — is the
   * signature of a half-created import: the product was made but its variants
   * never landed, so it kept Shopify's default 0.00 placeholder. Plenty of real
   * products have a single variant (a watch, a one-size cap), and those are fine.
   */
  const isBroken = (d) =>
    d.variants.nodes.length === 0 ||
    d.variants.nodes.some((v) => Number.parseFloat(v.price) <= 0);

  /**
   * Things we've decided not to stock — watches, collectibles, toys. Some were
   * imported before the taxonomy ruled them out, so they exist as drafts. This
   * makes sure a bulk publish can never quietly put them on the storefront.
   */
  const isUnwanted = (d) => EXCLUDE.test(N(d.title));

  /**
   * Copy that says the product is gone. The importer used to open every
   * description with "... is exclusive and no longer available anywhere
   * else", and Google took it at its word: 29 live, in-stock URLs were filed
   * as "Soft 404" in the 2026-09-20 Search Console export. A draft is
   * invisible, so the phrase is harmless there — publishing it is the moment
   * it starts costing index coverage, which makes this the place to stop it.
   *
   * Already-live products are left alone (--include-active is for adding a
   * channel, not a copy review); audit-soft404-copy.mjs covers those.
   */
  const hasSoft404Copy = (d) =>
    !ALLOW_SOFT404_COPY &&
    d.status === 'DRAFT' &&
    Boolean(findSoft404Phrase(d.descriptionHtml));

  const unwanted = drafts.filter(isUnwanted);
  const broken = drafts.filter((d) => !isUnwanted(d) && isBroken(d));
  const soft404 = drafts.filter(
    (d) => !isUnwanted(d) && !isBroken(d) && hasSoft404Copy(d),
  );
  const ready = drafts.filter(
    (d) => !isUnwanted(d) && !isBroken(d) && !hasSoft404Copy(d),
  );

  console.log(`\n  ready to publish : ${ready.length}`);
  if (unwanted.length) {
    console.log(`  not stocked      : ${unwanted.length} (watches / collectibles — never published)`);
    for (const u of unwanted.slice(0, 5)) console.log(`      ${u.handle}`);
    if (unwanted.length > 5) console.log(`      ...and ${unwanted.length - 5} more`);
    console.log('  Safe to delete in admin; the import will not recreate them.');
  }
  if (broken.length) {
    console.log(`  held back        : ${broken.length} (priced at zero — half-created)`);
    for (const b of broken.slice(0, 10)) console.log(`      ${b.handle}`);
    if (broken.length > 10) console.log(`      ...and ${broken.length - 10} more`);
    console.log('  Delete those in admin and re-run the import to recreate them properly.');
  }

  if (soft404.length) {
    console.log(`  held back        : ${soft404.length} (description reads as "gone" — Google files these as Soft 404)`);
    for (const d of soft404.slice(0, 10)) {
      console.log(`      ${d.handle}  …${findSoft404Phrase(d.descriptionHtml)}…`);
    }
    if (soft404.length > 10) console.log(`      ...and ${soft404.length - 10} more`);
    console.log('  Rewrite them first:  node scripts/audit-soft404-copy.mjs');
    console.log('                       node scripts/improve-descriptions.mjs --include-drafts --handles-from=soft404-copy-report.csv');
    console.log('  (dry-run that first and read the copy — the generator is written for shoes and\n   apparel, and calls laces and care products "a sneaker")');
    console.log('  or pass --allow-soft404-copy if the wording is a false positive.');
  }

  const batch = Number.isFinite(LIMIT) ? ready.slice(0, LIMIT) : ready;

  if (!APPLY) {
    console.log(`\nDry run — nothing published. Re-run with --apply.\n`);
    return;
  }

  const input = channels.map((c) => ({publicationId: c.id}));
  const failures = [];
  let done = 0;

  console.log(`\nPublishing ${batch.length}...`);
  for (const p of batch) {
    try {
      // Already-active products only need the channel added, not reactivating.
      if (p.status !== 'ACTIVE') {
        const act = await admin(ACTIVATE, {product: {id: p.id, status: 'ACTIVE'}});
        const e1 = act.productUpdate.userErrors;
        if (e1.length) failures.push(`${p.handle}: ${e1.map((e) => e.message).join('; ')}`);
      }

      if (!STATUS_ONLY) {
        const pub = await admin(PUBLISH, {id: p.id, input});
        const e2 = pub.publishablePublish.userErrors;
        if (e2.length) failures.push(`${p.handle}: ${e2.map((e) => e.message).join('; ')}`);
      }
    } catch (error) {
      failures.push(`${p.handle}: ${error.message}`);
    }
    done++;
    if (done % 20 === 0 || done === batch.length) {
      process.stdout.write(`\r  published ${done}/${batch.length}  (${failures.length} failed)`);
    }
  }
  process.stdout.write('\n');

  if (failures.length) {
    console.log(`\n${failures.length} failed:`);
    for (const f of failures.slice(0, 20)) console.log(`  ${f}`);
    process.exitCode = 1;
  } else {
    console.log('\nLive.\n');
  }
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
