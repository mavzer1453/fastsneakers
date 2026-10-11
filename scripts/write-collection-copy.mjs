#!/usr/bin/env node
/**
 * Write a short introduction onto each collection, from what is in it.
 *
 * Why this exists:
 *
 * Collection pages are the pages that can rank for the head terms — "asics
 * gel kayano", "nike dunk low", "ugg tasman" — and on 2026-09-20 every one of
 * them was a bare product grid. 192 of 228 collections had no description at
 * all and the other 36 had a single line; the storefront did not render even
 * that. A page with a title, 24 cards and no sentence gives Google nothing to
 * tell it apart from the 227 other grids, and one of them
 * (/collections/asics-gel-kayano) had already been filed as a Soft 404.
 *
 * The copy is composed from the collection's own products, so it is true and
 * it differs from page to page: how many styles, which lines and brands they
 * span, which collaborations are in there, what sizes they run. Nothing is
 * stated that the catalogue does not back up, and no prices are quoted —
 * those move weekly and a stale price in copy is worse than none.
 *
 * Figures are rounded DOWN ("more than 190") so the sentence stays true as
 * stock rotates, and the sentence shapes vary by handle so 228 pages do not
 * share one template.
 *
 * What it touches:
 *   - collections with NO description get one
 *   - collections with a one-line description keep that line as the opener
 *     and gain the rest
 *   - anything longer, or not written by this script, is left alone unless
 *     --regenerate is passed (which only re-writes this script's own output,
 *     recognised by its data-generated marker)
 *
 * Usage:
 *   node scripts/write-collection-copy.mjs                  # dry run + report
 *   node scripts/write-collection-copy.mjs --apply
 *   node scripts/write-collection-copy.mjs --apply --offset=60 --limit=60
 *   node scripts/write-collection-copy.mjs --apply --regenerate
 *
 * Writes collection-copy-report.csv every run, and on --apply a timestamped
 * collection-copy-rollback-*.csv with the previous descriptionHtml.
 */

import {existsSync, readFileSync, writeFileSync} from 'node:fs';

import {createAdminClient} from './lib/admin.mjs';
import {brandLabel} from './lib/taxonomy.mjs';

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
const APPLY = process.argv.includes('--apply');
const REGENERATE = process.argv.includes('--regenerate');
const numberArg = (name, fallback) => {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`));
  const n = raw ? Number.parseInt(raw.slice(name.length + 3), 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const OFFSET = numberArg('offset', 0);
const LIMIT = numberArg('limit', Infinity);

const {gql} = createAdminClient({
  shop: SHOP,
  clientId: process.env.SHOPIFY_CLIENT_ID,
  clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
});

const MARKER = 'data-generated="collection-copy"';

// ------------------------------------------------------------------ helpers --

const stripTags = (html) =>
  (html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function seedOf(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
const pick = (list, seed) => list[seed % list.length];

/** "a, b and c" */
const listOf = (items) =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/** 194 -> "more than 190"; 46 -> "more than 40"; 8 -> "8". */
function roundedCount(n) {
  if (n < 12) return String(n);
  const step = n >= 1000 ? 100 : n >= 100 ? 10 : 5;
  const floor = Math.floor((n - 1) / step) * step;
  return `more than ${floor.toLocaleString('en-US')}`;
}

// One word each: these are joined with "and", so a noun that contains one
// ("trousers and denim and shorts") reads as a stutter.
const TYPE_NOUNS = {
  sneakers: 'sneakers',
  Sneakers: 'sneakers',
  Slippers: 'slippers',
  Boots: 'boots',
  'T-Shirts': 'T-shirts',
  Tops: 'tops',
  Hoodies: 'hoodies',
  Pants: 'trousers',
  Shorts: 'shorts',
  Tracksuits: 'tracksuits',
  Jackets: 'jackets',
  Accessories: 'accessories',
};
const SHOE_TYPES = new Set(['sneakers', 'Sneakers', 'Slippers', 'Boots']);

const titleCase = (slug) =>
  slug
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');

/** `ugg-classic` -> "UGG Classic": the brand keeps its own styling. */
const STYLED_HEADS = ['new-balance', 'ugg', 'asics', 'adidas', 'hoka', 'bape', 'kaws', 'clot', 'nocta'];
function lineName(slug) {
  const head = STYLED_HEADS.find((h) => slug === h || slug.startsWith(`${h}-`));
  if (!head) return titleCase(slug);
  const label = {kaws: 'KAWS', clot: 'CLOT', nocta: 'NOCTA'}[head] ?? brandLabel(head);
  const rest = slug.slice(head.length + 1);
  return rest ? `${label} ${titleCase(rest)}` : label;
}

/** Most common values of a tag prefix, as [value, count], most common first. */
function topTags(products, prefix) {
  const counts = new Map();
  for (const product of products) {
    for (const tag of product.tags) {
      if (!tag.startsWith(prefix)) continue;
      const value = tag.slice(prefix.length);
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function sizeRange(products, shoes) {
  // Only sizes a real share of the collection comes in. One mis-tagged
  // product used to stretch "Kids — Toddler" to "EU 17–49".
  const counts = new Map();
  for (const product of products) {
    for (const tag of product.tags) {
      if (!tag.startsWith('size:')) continue;
      const size = tag.slice(5).trim();
      counts.set(size, (counts.get(size) ?? 0) + 1);
    }
  }
  const floor = Math.max(2, products.length * 0.1);
  const values = new Set(
    [...counts.entries()].filter(([, c]) => c >= floor).map(([size]) => size),
  );
  if (shoes) {
    const nums = [...values]
      .map((v) => Number.parseFloat(v.replace(',', '.')))
      .filter((n) => Number.isFinite(n) && n >= 16 && n <= 52);
    if (nums.length < 2) return null;
    const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
    return `EU ${fmt(Math.min(...nums))}–${fmt(Math.max(...nums))}`;
  }
  const ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
  const have = ORDER.filter((size) => values.has(size) || values.has(size.toLowerCase()));
  return have.length >= 2 ? `${have[0]}–${have[have.length - 1]}` : null;
}

// ---------------------------------------------------------------- composing --

const CLOSERS = [
  'Every item is sourced through our partner network and checked by hand before it ships, with free tracked shipping and 14-day returns.',
  'We check each piece ourselves before dispatch — material, finishing, box and labels — and ship it free and tracked, with 14 days to return it.',
  'Shipping is free and tracked on every order, returns are open for 14 days, and nothing leaves us without being checked by hand first.',
];

/**
 * @param collection  {handle, title, count, existingLine}
 * @param products    up to 100 best sellers: {title, productType, tags}
 * @param titles      collection handle -> title, for naming model lines
 */
export function compose(collection, products, titles) {
  const seed = seedOf(collection.handle);
  const {title, count} = collection;

  const types = new Map();
  for (const product of products) {
    types.set(product.productType, (types.get(product.productType) ?? 0) + 1);
  }
  const rankedTypes = [...types.entries()]
    .filter(([type]) => TYPE_NOUNS[type])
    .sort((a, b) => b[1] - a[1]);
  const shoes =
    rankedTypes.length > 0 &&
    rankedTypes.filter(([type]) => SHOE_TYPES.has(type)).reduce((n, [, c]) => n + c, 0) >=
      products.length / 2;
  // Types that make up a real share, not a stray item.
  const typeNouns = rankedTypes
    .filter(([, c]) => c >= Math.max(2, products.length * 0.08))
    .slice(0, 3)
    .map(([type]) => TYPE_NOUNS[type]);
  const things = typeNouns.length ? listOf(typeNouns) : 'styles';

  // Lines and brands other than the one the collection is already named for.
  const named = title.toLowerCase();
  // Model lines are a footwear idea. On an apparel shelf they only show up
  // through a stray match — "Nike Air Max 1 Essential" sits in Essentials —
  // and the copy would present them as the heart of the range.
  const modelNames = shoes
    ? topTags(products, 'model:')
        .filter(([slug, c]) => c >= 3 && !/^(shoelaces|caps-hats|bags)$/.test(slug))
        .map(([slug]) => titles.get(slug) ?? lineName(slug))
        .filter(
          (name) => name.toLowerCase() !== named && !named.includes(name.toLowerCase()),
        )
    : [];
  // "Air Jordan 1, Yeezy and Air Jordan 1 Mid": keep a parent line OR its
  // children, never both — unless the page IS the parent.
  const models = [];
  for (const name of modelNames) {
    if (models.length === 3) break;
    const lower = name.toLowerCase();
    const clash = models.some(
      (kept) =>
        lower.startsWith(`${kept.toLowerCase()} `) ||
        kept.toLowerCase().startsWith(`${lower} `),
    );
    if (!clash) models.push(name);
  }
  const brands = topTags(products, 'brand:')
    .filter(([, c]) => c >= 2)
    .map(([slug]) => brandLabel(slug))
    .filter((name) => name && !named.includes(name.toLowerCase()))
    .slice(0, 4);
  const collabs = topTags(products, 'collab:')
    .filter(([, c]) => c >= 2)
    .map(([slug]) =>
      (titles.get(`collab-${slug}`) ?? lineName(slug)).replace(/\s+collabs?$/i, ''),
    )
    .filter((name) => name && !named.includes(name.toLowerCase()))
    .slice(0, 3);
  // A bag has no size; an accessories shelf quoting "XXS–XXXL" is reading
  // the odd beanie.
  const mostlyAccessories = (rankedTypes[0]?.[0] ?? '') === 'Accessories';
  // Kids shelves state their own range in the hand-written opener ("roughly
  // EU 17–27"), and the size tags on those products are not clean enough to
  // agree with it.
  const range =
    mostlyAccessories || /^kids/.test(collection.handle)
      ? null
      : sizeRange(products, shoes);

  const howMany = roundedCount(count);
  const openers = [
    `${esc(title)}: ${howMany} ${things} in stock at Vespera Collectives.`,
    `Shop ${howMany} ${esc(title)} ${things === 'styles' ? 'styles' : `styles — ${things}`} at Vespera Collectives.`,
    `${howMany[0].toUpperCase() + howMany.slice(1)} ${things} make up our ${esc(title)} selection.`,
  ];
  // A hand-written line, where there is one, is a better opener than ours.
  const opener = collection.existingLine
    ? esc(collection.existingLine.replace(/\s*[.]?$/, '.'))
    : pick(openers, seed);

  const middle = [];
  if (models.length >= 2) {
    middle.push(
      pick(
        [
          `The range takes in the ${listOf(models.map(esc))}.`,
          `Lines include the ${listOf(models.map(esc))}.`,
        ],
        seed >>> 2,
      ),
    );
  } else if (brands.length >= 2) {
    middle.push(`Brands include ${listOf(brands.map(esc))}.`);
  }
  if (collabs.length) {
    middle.push(
      `Collaborations in the mix: ${listOf(collabs.map(esc))}.`,
    );
  }
  if (collection.existingLine) {
    // The opener did not carry the count, so say it here.
    middle.unshift(`${howMany[0].toUpperCase() + howMany.slice(1)} ${things} are in stock.`);
  }
  if (range) {
    middle.push(
      shoes
        ? `Sizes run ${range}, listed in EU with US and UK conversions in the size guide.`
        : `Sizes run ${range}.`,
    );
  }

  const closer = pick(CLOSERS, seed >>> 5);
  return `<p ${MARKER}>${[opener, ...middle, closer].join(' ')}</p>`;
}

// ------------------------------------------------------------------ queries --

const COLLECTIONS = `
  query Collections($cursor: String) {
    collections(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { id handle title descriptionHtml productsCount { count } }
    }
  }
`;

const PRODUCTS = `
  query CollectionProducts($id: ID!) {
    collection(id: $id) {
      products(first: 100, sortKey: BEST_SELLING) {
        nodes { title productType tags }
      }
    }
  }
`;

const UPDATE = `
  mutation Update($input: CollectionInput!) {
    collectionUpdate(input: $input) { userErrors { field message } }
  }
`;

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

async function main() {
  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — collection copy on ${SHOP}`);

  const all = [];
  let cursor = null;
  do {
    const data = await gql(COLLECTIONS, {cursor});
    all.push(...data.collections.nodes);
    cursor = data.collections.pageInfo.hasNextPage
      ? data.collections.pageInfo.endCursor
      : null;
  } while (cursor);

  const titles = new Map(all.map((c) => [c.handle, c.title]));

  const candidates = all.filter((collection) => {
    const html = collection.descriptionHtml ?? '';
    const text = stripTags(html);
    // Two or three products is a shelf label, not a page worth introducing.
    if (collection.productsCount.count < 4) return false;
    if (html.includes(MARKER)) return REGENERATE;
    // Keep anything somebody wrote at length.
    return text.length < 200;
  });
  const batch = candidates.slice(OFFSET, OFFSET + LIMIT);
  console.log(
    `${all.length} collections; ${candidates.length} to write` +
      (batch.length !== candidates.length ? `, this run ${batch.length}` : ''),
  );

  const planned = [];
  for (const collection of batch) {
    const data = await gql(PRODUCTS, {id: collection.id});
    const products = data.collection?.products?.nodes ?? [];
    if (!products.length) continue;
    const html = collection.descriptionHtml ?? '';
    const existingLine = html.includes(MARKER) ? null : stripTags(html) || null;
    const next = compose(
      {
        handle: collection.handle,
        title: collection.title,
        count: collection.productsCount.count,
        existingLine,
      },
      products,
      titles,
    );
    planned.push({collection, next});
    process.stderr.write(`\r  composed ${planned.length}/${batch.length}`);
  }
  process.stderr.write('\n');

  writeFileSync(
    new URL('../collection-copy-report.csv', import.meta.url),
    ['handle,title,products,new_description']
      .concat(
        planned.map(({collection, next}) =>
          [collection.handle, collection.title, collection.productsCount.count, stripTags(next)]
            .map(csvCell)
            .join(','),
        ),
      )
      .join('\n') + '\n',
  );
  console.log('Wrote collection-copy-report.csv');

  if (!APPLY) {
    console.log('\nDry run. Read the report, then re-run with --apply.');
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  writeFileSync(
    new URL(`../collection-copy-rollback-${stamp}.csv`, import.meta.url),
    ['id,handle,previous_description_html']
      .concat(
        planned.map(({collection}) =>
          [collection.id, collection.handle, collection.descriptionHtml].map(csvCell).join(','),
        ),
      )
      .join('\n') + '\n',
  );
  console.log(`Wrote collection-copy-rollback-${stamp}.csv`);

  let written = 0;
  let failed = 0;
  for (const {collection, next} of planned) {
    const data = await gql(UPDATE, {input: {id: collection.id, descriptionHtml: next}});
    if (data.collectionUpdate.userErrors.length) {
      failed += 1;
      console.error(`  ✗ ${collection.handle}: ${data.collectionUpdate.userErrors[0].message}`);
    } else {
      written += 1;
    }
  }
  console.log(`\nDone. ${written} collections written, ${failed} errors.`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
