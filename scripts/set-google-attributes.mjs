#!/usr/bin/env node
/**
 * Fill the Google Shopping product attributes the Merchant Center feed is
 * missing: age group, gender and colour.
 *
 * Why this exists:
 *
 * Merchant Center reported 0 approved offers out of 271K, and the reason was
 * not a policy problem — it was four missing attributes. Roughly 44.5K offers
 * each were flagged "missing age group", "missing gender" and "missing size",
 * and 38K "missing colour". For apparel and footwear Google treats these as
 * required, so every affected offer sits in "limited" and never enters free
 * listings or becomes eligible for ads.
 *
 * This script covers three of the four. SIZE IS DELIBERATELY NOT TOUCHED —
 * see the note at the bottom.
 *
 * Nothing here is invented: every value is derived from data already in the
 * catalogue.
 *
 *   age_group  from the title suffix — the same (TD)/(PS)/(GS) convention
 *              `isKidsProduct` uses in app/lib/sizes.ts and tag-bestsellers.
 *   gender     from the title, product type and tags; unisex unless the
 *              product says otherwise, which is correct for most of this
 *              catalogue.
 *   color      from the "Colorway:" / "Colourway:" line the importer left in
 *              the description on most items.
 *
 * Products that already have a value keep it. Nothing is overwritten unless
 * --force is passed, so this is safe to re-run after an import brings in new
 * stock.
 *
 * Usage:
 *   node scripts/set-google-attributes.mjs                  # dry run + report
 *   node scripts/set-google-attributes.mjs --apply
 *   node scripts/set-google-attributes.mjs --apply --limit=200
 *   node scripts/set-google-attributes.mjs --apply --force  # overwrite existing
 *   node scripts/set-google-attributes.mjs --only=color     # one attribute
 *   node scripts/set-google-attributes.mjs --only=color --supplier
 *                          # also read colourways from the supplier catalogue
 *
 * Writes google-attributes-report.csv every run, and on --apply a timestamped
 * google-attributes-rollback-*.csv holding the previous value of everything
 * it touched.
 */

import {existsSync, readFileSync, writeFileSync} from 'node:fs';

import {createAdminClient} from './lib/admin.mjs';
import {colorFamilies} from './lib/taxonomy.mjs';

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
const API_VERSION = '2025-07';

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
/** Also read colour from the supplier's current catalogue — see colorFromSupplier. */
const SUPPLIER = process.argv.includes('--supplier');
const SUPPLIER_URL = 'https://sneakerask.com';
/**
 * Optional JSON file ({handle: body_html}) to keep the supplier catalogue
 * between a dry run and the --apply that follows it. Fetching it is ~45
 * requests and most of a minute; doing that twice in a row buys nothing.
 * Delete the file to refresh.
 */
const SUPPLIER_CACHE = (
  process.argv.find((a) => a.startsWith('--supplier-cache=')) ?? ''
).slice('--supplier-cache='.length);
const LIMIT = (() => {
  const raw = process.argv.find((a) => a.startsWith('--limit='));
  if (!raw) return Infinity;
  const n = Number.parseInt(raw.slice(8), 10);
  return Number.isFinite(n) ? n : Infinity;
})();
const ONLY = (() => {
  const raw = process.argv.find((a) => a.startsWith('--only='));
  if (!raw) return null;
  return new Set(
    raw
      .slice(7)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
})();

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

/** The namespace Shopify's Google & YouTube channel reads. */
const NS = 'mm-google-shopping';

// ------------------------------------------------------------- derivation --

/**
 * Mirrors isKidsProduct in app/lib/sizes.ts and tag-bestsellers.mjs, but has
 * to distinguish toddler from older kids, which those two do not: Google's
 * age_group vocabulary is newborn / infant / toddler / kids / adult, and a
 * (TD) pair on an (GS) value would be as wrong as leaving it blank.
 *
 * (TD) Toddler roughly EU 17–27, (PS) Pre-School EU 27.5–35, (GS) Grade
 * School EU 35.5–40 — the same ranges the storefront FAQ documents. PS and GS
 * both map to "kids"; Google has no finer split.
 */
export function ageGroupFor({title, tags}) {
  const t = title ?? '';
  // Title wins over tags, deliberately. The two disagree on a handful of
  // imported products — "Jordan Jumpman Jack TR Travis Scott Sail (TD)" is
  // tagged `ps` — and the title is what app/lib/sizes.ts reads to decide
  // whether to show kids sizing, so following it keeps Google and the
  // storefront telling the same story.
  if (/\(td\)|\bb[\u00e9e]b[\u00e9e]\b|\btoddler\b|\binfant\b/i.test(t)) return 'toddler';
  if (/\((?:ps|gs)\)|\benfant\b|\bkids?\b|\bgrade school\b|\bpre-?school\b/i.test(t))
    return 'kids';

  // Only fall back to tags when the title carries no marker at all.
  const tagSet = new Set((tags ?? []).map((tag) => tag.toLowerCase()));
  if (tagSet.has('td')) return 'toddler';
  if (tagSet.has('ps') || tagSet.has('gs')) return 'kids';
  return 'adult';
}

/**
 * Unisex is the honest default for this catalogue — sneakers and streetwear
 * are listed once and bought by everyone — so only an explicit signal moves
 * it off that.
 *
 * The `women` tag is checked first because it is what the /collections/women
 * smart rules already run on, so Google and the storefront agree by
 * construction. "Wmns" is Nike's own women's marker and survives in the
 * imported titles verbatim.
 */
export function genderFor({title, tags, productType}) {
  const tagSet = new Set((tags ?? []).map((tag) => tag.toLowerCase()));
  if (tagSet.has('women') || tagSet.has('dames')) return 'female';
  if (tagSet.has('men') || tagSet.has('heren')) return 'male';

  const haystack = [title, productType].join(' ');
  if (/\bwmns\b|\bwomen'?s?\b|\bfemale\b|\bdames\b/i.test(haystack))
    return 'female';
  if (/\bmens\b|\bmen'?s\b|\bheren\b/i.test(haystack)) return 'male';
  return 'unisex';
}

/**
 * Colour comes from the `color:` tag first and the description second.
 *
 * The tag is the better source by a distance: fix-categories/import already
 * normalised it to a single plain word (color:beige, color:washed-black), it
 * is what the storefront colour filter runs on, and it exists on products
 * whose description was never populated. The "Colorway:" line the importer
 * left behind is the fallback for the ones that have no tag.
 *
 * Google wants ONE primary colour, so a three-colour colorway like
 * "SAIL/MUSLIN/DARK MOCHA" is cut at the first separator. Returns null when
 * there is nothing to read — a missing colour is better than a guessed one,
 * because a wrong colour makes the offer match searches it cannot satisfy.
 */
export function colorFor({tags, descriptionHtml}) {
  const tagged = (tags ?? []).find((tag) => /^color:/i.test(tag));
  if (tagged) return titleCase(tagged.slice(6).replace(/-/g, ' '));

  const text = (descriptionHtml ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');
  const match = text.match(/colou?rway\s*:?\s*([^<\n\r]+)/i);
  if (!match) return null;

  let primary = match[1]
    .split(/[\/|,]/)[0]
    .split(/\s+-\s+/)[0]
    // "ECLIPSE WITH SILVER METALLIC AND CRIMSON" — the lead colour is the
    // part before the conjunction.
    .split(/\s+(?:with|and)\s+/i)[0]
    .replace(/\b(?:SKU|Style code|Sizes?)\b.*$/i, '')
    .trim();
  // "MALACHITE-FIRED RED-BLACK-TAXI-WHITE": a colourway list joined with
  // hyphens instead of slashes. One hyphen is a real name (Off-White).
  if ((primary.match(/-/g) ?? []).length >= 2) primary = primary.split('-')[0];
  if (!primary || primary.length > 40) return null;
  const value = titleCase(primary);
  return isPlausibleColor(value) ? value : null;
}

/**
 * Colour from the SUPPLIER's current catalogue, for products our own data
 * cannot answer.
 *
 * 1,529 products had no colour anywhere we could read: no colour word in the
 * title ("Nike Dunk Low Vintage Panda"), no `color:` tag, no Colourway line.
 * Two ways of inventing one were tried on 2026-09-20 and rejected after being
 * scored against the 6,600 products whose colour IS known — dominant colour
 * of the product image (46% agreement) and the colour digit of Nike's style
 * code (44–65%). Neither is good enough to put in a feed.
 *
 * The supplier is. Since the import they have added, to most listings, the
 * manufacturer's own colourway ("SKU: IF4396-103 Colorway: Sail/Black/
 * University Red") and a sentence describing the shoe ("features a white
 * upper paired with signature blue accents"). That is real product data, not
 * a guess, and it is the same source every other attribute came from.
 *
 * Colourway line first. Google takes up to three colours separated by "/",
 * so the manufacturer's first three are kept as written. The line only
 * counts when its first entry names a colour we recognise — otherwise it is a
 * nickname repeated ("Colorway: Keep Ripping Stop Slippin") and says nothing.
 *
 * Prose second, and only from phrasing that is ABOUT the colour: "a dark
 * green and black upper", "color palette of white and black", "in a muted
 * purple colorway". A bare colour word elsewhere in the copy ("pairs well
 * with black jeans") is never read. Prose yields plain family names.
 */
const COLOR_PROSE = [
  /(?:features?|featuring|sports?|boasts?|has|with|comes with|showcases?|dressed in|built with|offers?) (?:an? |the )?((?:[\w-]+,? (?:and )?){1,4})(?:leather |suede |mesh |nubuck |canvas |knit |textile |primeknit |patent |tumbled |premium |nylon |sheepskin )*(?:upper|base|colou?rway|colou?r scheme|finish|exterior|body)\b/gi,
  /colou?r (?:palette|scheme|combination|blocking) of ([^.]{3,60})/gi,
  /\bin (?:an? |the )?((?:[\w-]+ ){1,3})colou?rway/gi,
];

export function colorFromSupplier(bodyHtml) {
  const text = (bodyHtml ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;

  const line = text.match(/colou?rway\s*:?\s*([^\n]{2,120})/i);
  if (line) {
    const raw = line[1].split(/\b(?:SKU|Style|Release|Retail|Sizes?)\b/i)[0];
    const parts = raw
      .split(/[\/,|]|\s+-\s+/)
      .map((part) => part.trim())
      // Nike writes "White/Game Royal-Black": the hyphen is a separator too.
      // The few real hyphenated colour names are kept whole.
      .flatMap((part) =>
        /^(off-white|multi-colou?r|tie-dye)$/i.test(part)
          ? [part]
          : part.split('-'),
      )
      .map((part) => titleCase(part.trim()).replace(/^Multi-colou?r$/i, 'Multicolor'))
      .filter(Boolean);
    if (parts.length && colorFamilies(parts[0]).length) {
      const kept = [];
      for (const part of parts) {
        if (kept.length === 3) break;
        // "Combining Neutral Cream" — prose that followed the label.
        if (/^\w+ing\b/i.test(part)) break;
        if (part.split(' ').length > 3 || !isPlausibleColor(part)) break;
        if (!kept.includes(part)) kept.push(part);
      }
      if (kept.length) return {value: kept.join('/'), source: 'supplier colourway'};
    }
  }

  for (const pattern of COLOR_PROSE) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const families = colorFamilies(match[1]).slice(0, 3);
      if (families.length) {
        return {
          value: families.map((family) => titleCase(family)).join('/'),
          source: 'supplier description',
        };
      }
    }
  }
  return null;
}

/** handle -> body_html for the supplier's whole catalogue (~45 requests). */
async function loadSupplierBodies() {
  if (SUPPLIER_CACHE && existsSync(SUPPLIER_CACHE)) {
    const cached = JSON.parse(readFileSync(SUPPLIER_CACHE, 'utf8'));
    console.log(`  supplier catalogue: ${Object.keys(cached).length} products (cached)`);
    return new Map(Object.entries(cached));
  }
  const bodies = new Map();
  for (let page = 1; page < 200; page += 1) {
    let products = null;
    for (let attempt = 0; attempt < 4 && !products; attempt += 1) {
      try {
        const res = await fetch(
          `${SUPPLIER_URL}/products.json?limit=250&page=${page}`,
          {headers: {'User-Agent': 'Mozilla/5.0'}},
        );
        if (res.ok) products = (await res.json()).products ?? [];
      } catch {
        // dropped connection — retried below
      }
      if (!products) await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
    }
    if (!products) throw new Error(`Supplier catalogue: page ${page} failed`);
    if (!products.length) break;
    for (const product of products) bodies.set(product.handle, product.body_html ?? '');
    process.stderr.write(`\r  supplier catalogue: ${bodies.size} products`);
  }
  process.stderr.write('\n');
  if (SUPPLIER_CACHE) {
    writeFileSync(SUPPLIER_CACHE, JSON.stringify(Object.fromEntries(bodies)));
  }
  return bodies;
}

/**
 * Whether a string can stand as a colour in the feed.
 *
 * The "Colourway:" regex trusts whatever follows the label, and on 40
 * products what followed was not a colour: a bare "." (19 of them), "Tbd",
 * the style code ("Hq1461-471"), or the tail of a marketing sentence — "That
 * Radiates Power And Control.", "Is Inspired By Seasonal Autumn Tones.". All
 * of those went into `mm-google-shopping.color` on 2026-09-18 and from there
 * to Merchant Center. A wrong colour is worse than a missing one: missing is
 * a warning, wrong makes the offer match searches it cannot satisfy.
 *
 * Checked against every value live on 2026-09-20: rejects those 40 and none
 * of the 430-odd genuine manufacturer names ("Light Orewood Brown",
 * "Realtree Hardwoods Camo", "Off Noir").
 */
export function isPlausibleColor(value) {
  // Google's format is up to three colours joined by "/", which is what the
  // supplier colourways are stored as. Each colour is judged on its own —
  // judged whole, "Venom Green/Light Lemon Twist/Light Current Blue" is seven
  // words and would be deleted as prose on the next run.
  const segments = (value ?? '').split('/');
  return segments.length <= 3 && segments.every(isPlausibleSegment);
}

function isPlausibleSegment(value) {
  const v = (value ?? '').trim();
  if (!/[a-z]{3}/i.test(v)) return false; // ".", "S"
  if (/[.!?]$/.test(v)) return false; // end of a sentence
  if (/\d{3}/.test(v)) return false; // style code
  if (/^(tbd|n\/?a|unknown|none)$/i.test(v)) return false;
  if (v.split(/\s+/).length > 4) return false; // prose
  if ((v.match(/-/g) ?? []).length >= 3) return false;
  return !/^(is|are|was|s|that|this|the|a|an|and|of|in|with|references|inspired|celebrating|suitable|details)\b/i.test(
    v,
  );
}

/** "DARK MOCHA" -> "Dark Mocha", "washed black" -> "Washed Black". */
function titleCase(value) {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ----------------------------------------------------------------- queries --

/**
 * 50 products × metafields(first: 10) is roughly 550 cost points against the
 * 1000-point bucket — inside the N × M < 800 guidance in lib/admin.mjs.
 */
const PRODUCTS = `
  query Products($cursor: String) {
    products(first: 50, after: $cursor, query: "status:active") {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        title
        productType
        tags
        options { name }
        descriptionHtml
        metafields(first: 10, namespace: "${NS}") {
          nodes { key value }
        }
      }
    }
  }
`;

const SET = `
  mutation Set($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id }
      userErrors { field message code }
    }
  }
`;

const DELETE = `
  mutation Delete($metafields: [MetafieldIdentifierInput!]!) {
    metafieldsDelete(metafields: $metafields) {
      deletedMetafields { key }
      userErrors { field message }
    }
  }
`;

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

async function main() {
  console.log(
    `${APPLY ? 'APPLYING' : 'DRY RUN'} — Google attributes on ${SHOP}` +
      (FORCE ? ' (overwriting existing values)' : '') +
      (ONLY ? ` (only: ${[...ONLY].join(', ')})` : ''),
  );

  const supplierBodies = SUPPLIER ? await loadSupplierBodies() : null;

  const planned = [];
  const rollback = [];
  let cursor = null;
  let scanned = 0;

  while (planned.length < LIMIT) {
    const data = await gql(PRODUCTS, {cursor});
    const page = data.products;

    for (const product of page.nodes) {
      scanned += 1;
      const existing = Object.fromEntries(
        product.metafields.nodes.map((m) => [m.key, m.value]),
      );

      const ownColor = colorFor(product);
      // A variant-level "Color" option already reaches Google on its own.
      const hasColorOption = (product.options ?? []).some((option) =>
        /^colou?r$/i.test(option.name),
      );
      const supplierColor =
        !ownColor && !hasColorOption && supplierBodies
          ? colorFromSupplier(supplierBodies.get(product.handle))
          : null;

      const wanted = {
        age_group: ageGroupFor(product),
        gender: genderFor(product),
        color: ownColor ?? supplierColor?.value ?? null,
      };
      const colorSource = ownColor ? 'catalogue' : (supplierColor?.source ?? '');

      // A stored colour that is not a colour counts as no colour at all: it
      // is replaced when something better can be derived and DELETED when
      // nothing can, without needing --force. See isPlausibleColor.
      const junkColor =
        Boolean(existing.color) && !isPlausibleColor(existing.color);

      const changes = [];
      for (const [key, value] of Object.entries(wanted)) {
        if (ONLY && !ONLY.has(key)) continue;
        const replaceJunk = key === 'color' && junkColor;
        if (value === null) {
          if (replaceJunk) {
            changes.push({key, value: null, previous: existing[key]});
          }
          continue;
        }
        if (existing[key] && !FORCE && !replaceJunk) continue;
        if (existing[key] === value) continue;
        changes.push({
          key,
          value,
          previous: existing[key] ?? '',
          source: key === 'color' ? colorSource : '',
        });
      }

      if (!changes.length) continue;

      planned.push({product, changes});
      for (const change of changes) {
        rollback.push([product.id, product.title, change.key, change.previous]);
      }
      if (planned.length >= LIMIT) break;
    }

    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }

  // ------------------------------------------------------------- report ---

  const report = [
    ['id', 'title', 'attribute', 'previous', 'new', 'source'].join(','),
    ...planned.flatMap(({product, changes}) =>
      changes.map((c) =>
        [
          product.id,
          product.title,
          c.key,
          c.previous,
          c.value ?? '(deleted)',
          c.source ?? '',
        ]
          .map(csvCell)
          .join(','),
      ),
    ),
  ].join('\n');
  writeFileSync(
    new URL('../google-attributes-report.csv', import.meta.url),
    report + '\n',
  );

  const fieldCount = planned.reduce((n, p) => n + p.changes.length, 0);
  console.log(
    `Scanned ${scanned} active products; ${planned.length} need changes ` +
      `(${fieldCount} metafields). Wrote google-attributes-report.csv`,
  );

  const noColor = planned.filter(
    ({changes}) => !changes.some((c) => c.key === 'color'),
  ).length;
  if (noColor) {
    console.log(
      `  note: ${noColor} of those have no readable Colorway line — ` +
        'colour left unset on purpose rather than guessed.',
    );
  }

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write.');
    return;
  }

  // ----------------------------------------------------------- rollback ---

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  writeFileSync(
    new URL(`../google-attributes-rollback-${stamp}.csv`, import.meta.url),
    ['id,title,attribute,previous_value']
      .concat(rollback.map((row) => row.map(csvCell).join(',')))
      .join('\n') + '\n',
  );
  console.log(`Wrote google-attributes-rollback-${stamp}.csv`);

  // -------------------------------------------------------------- write ---

  // metafieldsSet takes at most 25 metafields per call.
  const batch = [];
  let written = 0;
  let failed = 0;

  const flush = async () => {
    if (!batch.length) return;
    const data = await gql(SET, {metafields: batch.splice(0, batch.length)});
    const errors = data.metafieldsSet.userErrors;
    if (errors.length) {
      failed += errors.length;
      for (const error of errors.slice(0, 5)) {
        console.error(`  userError: ${error.code} ${error.message}`);
      }
    }
    written += data.metafieldsSet.metafields.length;
    if (written % 500 < 25) console.log(`  ${written} metafields written…`);
  };

  // Junk values with nothing to replace them are removed outright.
  const deletions = planned.flatMap(({product, changes}) =>
    changes
      .filter((change) => change.value === null)
      .map((change) => ({ownerId: product.id, namespace: NS, key: change.key})),
  );
  let deleted = 0;
  for (let i = 0; i < deletions.length; i += 25) {
    const data = await gql(DELETE, {metafields: deletions.slice(i, i + 25)});
    failed += data.metafieldsDelete.userErrors.length;
    deleted += (data.metafieldsDelete.deletedMetafields ?? []).filter(Boolean)
      .length;
  }
  if (deletions.length) console.log(`  ${deleted} junk values deleted`);

  for (const {product, changes} of planned) {
    for (const change of changes) {
      if (change.value === null) continue;
      batch.push({
        ownerId: product.id,
        namespace: NS,
        key: change.key,
        type: 'single_line_text_field',
        value: change.value,
      });
      if (batch.length === 25) await flush();
    }
  }
  await flush();

  console.log(`\nDone. ${written} metafields written, ${failed} errors.`);
  console.log(
    'Merchant Center reprocesses the feed over the next 24-48h; check ' +
      'Products > Needs attention for the missing-attribute counts falling.',
  );
}

/*
 * ------------------------------------------------------------------ size --
 *
 * Size is the fourth missing attribute (44,387 offers) and this script does
 * NOT set it, on purpose.
 *
 * Size is per-variant, not per-product, so a product-level metafield cannot
 * express it. Shopify's Google channel reads size from the variant option,
 * and ours is named "Maat" — which normalize-options.mjs standardised on
 * deliberately, because Shopify builds one filter per option NAME and the
 * catalogue had it split across Maat / Mate / Size / Schoenmaat.
 *
 * Renaming it to "Size" would very likely fix the feed, and the storefront
 * would survive it — `displayOptionName` in app/components/QuickAdd.tsx
 * already maps Maat, Mate, Schoenmaat, Title, Größe and Taille onto one
 * "Size" label, so the picker, cart and filters are name-agnostic.
 *
 * What would break is links. The product route writes the option into the
 * query string, so existing URLs look like ?Maat=42+EU. After a rename those
 * select nothing; `ignoreUnknownOptions: true` means the page silently falls
 * back to the first available variant rather than erroring, which is worse
 * than a 404 because nobody notices. That hits indexed URLs, old emails, and
 * the links already inside the Meta and TikTok catalogues.
 *
 * So: run this script first, wait for Merchant Center to reprocess, and see
 * whether "missing size" clears on its own. If it does not, do the rename as
 * its own change with redirects for ?Maat= — `normalize-options.mjs --apply
 * --name="Size"` already supports it.
 */

// Only run when invoked directly, so the derivation helpers above can be
// imported by a test without firing a catalogue-wide pass.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
