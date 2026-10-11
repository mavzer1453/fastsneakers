#!/usr/bin/env node
/**
 * Rewrite the product descriptions that are hurting us in search.
 *
 * Why this exists, and why it is not gen-descriptions.mjs:
 *
 * Search Console shows 7,279 pages "Discovered - currently not indexed" and
 * 500 "Crawled - currently not indexed". After the crawler geo-redirect bug
 * (see server.ts) the next most likely cause is the pages themselves: on a
 * 9.5K catalogue, Google will not spend crawl budget indexing thousands of
 * near-identical thin pages.
 *
 * Three populations need fixing, and gen-descriptions.mjs catches none of
 * them — it only fills products whose description is completely EMPTY:
 *
 *   thin    a single line, typically "Colourway: White" and nothing else.
 *   dutch   Dutch copy on an English storefront — "De Air Jordan ... is
 *           exclusief en nergens meer te krijgen". Wrong language is worse
 *           than thin: it competes for the wrong queries entirely.
 *   stale   descriptions carrying "free over €50", which gen-descriptions.mjs
 *           wrote. Shipping is free on EVERY order with no minimum — see
 *           app/data/shop.ts and the storefront shipping page. That line is
 *           factually wrong, contradicts the Merchant Center shipping policy,
 *           and is the kind of mismatch Google flags on landing pages.
 *
 * The replacement is composed from data that actually differs per product —
 * brand, model, colourway, style code, silhouette, size range — so 9.5K
 * products do not end up with 9.5K copies of the same paragraph. A template
 * that is 90% identical everywhere is not a fix for thin content; it is thin
 * content with more words.
 *
 * Usage:
 *   node scripts/improve-descriptions.mjs                     # dry run + report
 *   node scripts/improve-descriptions.mjs --apply --limit=50  # pilot
 *   node scripts/improve-descriptions.mjs --apply
 *   node scripts/improve-descriptions.mjs --only=dutch,stale
 *   node scripts/improve-descriptions.mjs --regenerate          # refresh our own
 *   node scripts/improve-descriptions.mjs --apply --regenerate
 *   node scripts/improve-descriptions.mjs --only=boilerplate --include-drafts
 *   node scripts/improve-descriptions.mjs --include-drafts \
 *        --handles-from=soft404-copy-report.csv     # just the audit's hits
 *
 * Writes improve-descriptions-report.csv every run, and on --apply a
 * timestamped rollback CSV holding the FULL previous descriptionHtml of every
 * product it touches. This one rewrites customer-facing copy at scale, so the
 * rollback is not optional.
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
const API_VERSION = '2025-07';

const APPLY = process.argv.includes('--apply');
const LIMIT = (() => {
  const raw = process.argv.find((a) => a.startsWith('--limit='));
  if (!raw) return Infinity;
  const n = Number.parseInt(raw.slice(8), 10);
  return Number.isFinite(n) ? n : Infinity;
})();
const INCLUDE_BOILERPLATE = process.argv.includes('--include-boilerplate');
const REGENERATE = process.argv.includes('--regenerate');
/**
 * Drafts are skipped by default because nobody can see them — but they are
 * not harmless. publish-drafts.mjs turns them into live pages with whatever
 * copy they were imported with, and on 2026-09-20 52 drafts still opened
 * with "no longer available anywhere else", the sentence that got 29 live
 * product URLs classified as Soft 404. Pass this before publishing a batch.
 */
const INCLUDE_DRAFTS = process.argv.includes('--include-drafts');
/**
 * Restrict a run to the handles in a file — either one handle per line or a
 * CSV with a `handle` column, which is what audit-soft404-copy.mjs writes.
 *
 * Without this the only way to reach the 55 products still carrying a
 * soft-404 phrase was `--only=boilerplate`, which also plans the 200-odd
 * other legacy descriptions nobody had agreed to replace yet.
 *
 * Naming a product is itself the opt-in, so `boilerplate` is rewritten for
 * listed handles without --include-boilerplate.
 */
const HANDLES = (() => {
  const raw = process.argv.find((a) => a.startsWith('--handles-from='));
  if (!raw) return null;
  const lines = readFileSync(raw.slice('--handles-from='.length), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim());
  const header = lines[0].split(',').map((c) => c.replace(/"/g, '').trim());
  const column = header.indexOf('handle');
  const rows = column === -1 ? lines : lines.slice(1);
  return new Set(
    rows.map((line) =>
      (column === -1 ? line : line.split(',')[column] ?? '')
        .replace(/"/g, '')
        .trim(),
    ),
  );
})();
const ONLY = (() => {
  const raw = process.argv.find((a) => a.startsWith('--only='));
  if (!raw) return null;
  return new Set(raw.slice(7).split(',').map((s) => s.trim()).filter(Boolean));
})();

/** Below this many characters of plain text, a description is thin. */
const MIN_CHARS = 160;

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

// ------------------------------------------------------------ classifying --

const stripTags = (html) =>
  (html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Dutch detection by stopword scoring rather than a single marker.
 *
 * "de", "een" and "en" all appear in English text as fragments, so each is
 * matched on word boundaries and TWO independent hits are required before a
 * description is called Dutch. The importer's own boilerplate ("exclusief",
 * "nergens", "Grijp nu jouw kans") is conclusive on its own.
 */
function isDutch(text) {
  if (/\b(exclusief|nergens|ongedragen|grijp nu|jouw kans|kwaliteit)\b/i.test(text))
    return true;
  const stopwords = text.match(
    /\b(de|het|een|niet|meer|voor|met|zijn|wordt|bij|naar|deze)\b/gi,
  );
  return (stopwords?.length ?? 0) >= 2;
}

/**
 * The English import boilerplate — "... is exclusive and no longer available
 * anywhere. At Fast Sneakers it is! 100% authentic & unworn." — is long
 * enough to pass the thin test and is in the right language, but it is
 * IDENTICAL on thousands of products bar the title. That is duplicate content
 * at scale and a plausible contributor to "Discovered - currently not
 * indexed".
 *
 * It is classified separately and NOT rewritten by default, because replacing
 * real copy is a bigger call than filling a blank: pass
 * --include-boilerplate (or --only=boilerplate) once you have read the report
 * and agree.
 */
/**
 * Markers of the imported store copy this script replaces.
 *
 * The first three were the obvious template. The rest come from a second
 * shape that slipped through the 2026-09-19 run — "<title> is now available
 * at Fast Sneakers. The shoes fit true to size…" followed by a
 * "Size not in stock?" pitch. It is not thin, not Dutch and not generated,
 * so every other classifier called it fine and left it live.
 *
 * `vespera collectives` is the broad net: describe() never writes the store
 * name into a description, so any body that says it is legacy copy.
 */
const BOILERPLATE = [
  // Any "no longer available", not only the template's "... anywhere": a
  // hand-edited variant ("These exclusive sneakers are no longer available,
  // except from us") survived the 2026-09-19 run, and this phrase is the one
  // that reads to Google as a Soft 404 on a page that is in stock.
  /no longer available/i,
  /grab your chance now/i,
  /100% authentic & unworn/i,
  /vespera collectives/i,
  /send us a message via instagram/i,
  /request an item/i,
  /size not in stock/i,
  // Same pitch, other wording — live on two NOCTA Air Force 1s.
  /size out of stock/i,
];

function isBoilerplate(text) {
  return BOILERPLATE.some((re) => re.test(text ?? ''));
}

// Whitespace BETWEEN tags is dropped as well as collapsed: Shopify stores
// `<li>\n<strong>` where we wrote `<li><strong>`, and with only the collapse
// every one of 8,981 generated descriptions compared as "changed" — so a
// --regenerate run planned a rewrite of the whole catalogue to alter nothing.
const flatten = (html) =>
  String(html ?? '')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();

/**
 * Recognises this script's own output.
 *
 * Needed because the generator improves. The 8,403-product run on
 * 2026-09-19 went out with a version that, among other things, described
 * unbranded products as "a Fast Sneakers sneaker" — and once written,
 * those descriptions are no longer `boilerplate`, no longer `thin` and no
 * longer Dutch, so every classifier called them "already fine" and there was
 * no way to reach them again short of restoring the rollback CSV.
 *
 * `--regenerate` re-runs `describe()` over them. Because `describe()` is
 * deterministic, a product whose copy is already current produces a
 * byte-identical result and is dropped by the unchanged check in main(), so
 * a regenerate pass only writes the ones an improvement actually affected.
 */
function isGenerated(html) {
  // Shopify reformats description HTML on save: the `<li><strong>` this
  // script writes comes back as `<li>\n<strong>`. Matching the literal meant
  // isGenerated() was false for every live product, classify() called them
  // all "already fine", and --regenerate could never reach a single one.
  const flat = flatten(html);
  return (
    /<li>\s*<strong>Condition:<\/strong> Brand new, unworn, in original packaging<\/li>/.test(
      flat,
    ) && flat.includes(SHIPPING_LINE)
  );
}

function classify(html) {
  const text = stripTags(html);
  if (!text) return 'empty';
  if (/free over\s*€?\s*50/i.test(text)) return 'stale';
  if (isGenerated(html)) return 'regen';
  if (text.length < MIN_CHARS) return 'thin';
  if (isDutch(text)) return 'dutch';
  if (isBoilerplate(text)) return 'boilerplate';
  return null;
}


// -------------------------------------------------------------- composing --

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const titleCase = (s) =>
  String(s ?? '')
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

const tagValue = (tags, prefix) => {
  const hit = (tags ?? []).find((t) => t.toLowerCase().startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
};

/**
 * Pull the facts the importer left in the old description before we throw it
 * away. Style code and colourway are genuinely per-product and are exactly
 * the kind of detail a shopper searches for ("FJ2852-100"), so they are
 * carried into the new copy rather than lost.
 */
function salvage(html) {
  const text = stripTags(html);
  const sku = text.match(/\bSKU\s*:?\s*([A-Z0-9][A-Z0-9-]{3,})/i)?.[1] ?? null;
  // The colourway runs until the next label, not until the end of the line.
  // Where the importer left "Colourway: Sea Salt/Linen SKU: U9060SSL" on one
  // line, the lazy match still ran to `$` and produced a colourway with the
  // style code glued on — which then rendered as
  // "Colourway: Sea Salt/Linen SKU: U9060SSL" on the live page, with the same
  // code repeated on the Style code line below it. Cut at any label that can
  // follow, then trim the separator left behind.
  const colorway =
    (text.match(/colou?rway\s*:?\s*([^.]{2,80}?)(?:\s{2,}|$)/i)?.[1] ?? '')
      .replace(
        /\b(sku|style\s*code|art(?:icle)?\s*(?:no\.?|code)|colou?r\s*code)\b.*$/i,
        '',
      )
      .replace(/[\s,;|/-]+$/, '')
      .trim() || null;
  // "...we love this colourway here at all seasons" would otherwise yield a
  // colourway of "here at all". A real one never opens with a stopword.
  const clean =
    colorway && !/^(is|are|was|were|the|a|an|this|that|here|it|and|of|in)\b/i.test(colorway)
      ? colorway
      : null;
  return {sku, colorway: clean};
}

/** "36 EU"…"47.5 EU" -> "EU 36–47.5"; S/M/L -> "S–XXL". */
function sizeRange(tags) {
  const sizes = (tags ?? [])
    .filter((t) => /^size:/i.test(t))
    .map((t) => t.slice(5).trim());
  if (!sizes.length) return null;

  const numeric = sizes
    .map((s) => Number.parseFloat(s.replace(',', '.')))
    .filter((n) => Number.isFinite(n));
  if (numeric.length >= 2) {
    const min = Math.min(...numeric);
    const max = Math.max(...numeric);
    if (min !== max) return `EU ${min}–${max}`;
  }

  const ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
  const lettered = sizes
    .map((s) => s.toUpperCase())
    .filter((s) => ORDER.includes(s))
    .sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  if (lettered.length >= 2)
    return `${lettered[0]}–${lettered[lettered.length - 1]}`;
  return null;
}

const CATEGORY_LABELS = {
  sneakers: 'sneaker',
  Sneakers: 'sneaker',
  Boots: 'boot',
  // 'slide' was wrong: the Slippers type is mostly UGG Tasman and Tazz,
  // which are clog slippers, not pool slides.
  Slippers: 'slipper',
  'T-Shirts': 'T-shirt',
  Hoodies: 'hoodie',
  Jeans: 'pair of jeans',
  Shorts: 'pair of shorts',
  Sweatpants: 'pair of sweatpants',
  Tracksuits: 'tracksuit',
  Sets: 'matching set',
  // These three had no label at all and fell through to "a piece".
  Pants: 'pair of trousers',
  Jackets: 'jacket',
  Tops: 'top',
  Accessories: 'accessory',
  bags: 'bag',
};

/**
 * Which sizing advice a product should get — and, for a lot of the
 * catalogue, none at all.
 *
 * The first version split on `isShoe` and gave everything else the apparel
 * line: "Relaxed streetwear cut, true to size — size down for a slimmer
 * fit". On a hoodie that is useful. On a Jacquemus handbag, a pair of
 * sunglasses, a bracelet or a set of shoelaces it is nonsense, and it would
 * have gone out on roughly 370 live product pages including the most
 * expensive things in the catalogue.
 *
 * `productType` alone cannot tell them apart: every bag in the store is
 * filed under `Accessories`, and the only thing separating a €600 Le Bambino
 * from a pair of laces is a `bags` tag.
 *
 *   shoe    -> EU sizing note
 *   apparel -> fit note
 *   carry   -> neither; a bag has no size and no cut
 *   other   -> neither, because we do not know what it is
 */
function categoryOf(product) {
  const type = product.productType ?? '';
  const tags = product.tags ?? [];

  if (/sneakers|boots|slippers/i.test(type)) {
    return {label: CATEGORY_LABELS[type] ?? 'pair', bucket: 'shoe'};
  }
  if (tags.some((tag) => /^bags$/i.test(tag))) {
    return {label: 'bag', bucket: 'carry'};
  }
  if (CATEGORY_LABELS[type] && type !== 'Accessories') {
    // The title outranks the product type for the noun. Types are derived
    // by keyword and miss: "Denim Tears Long Sleeve Cotton Wreath T-shirt" is
    // filed under Pants because of "Denim", and a type-only label called it
    // "a pair of trousers".
    const garment = GARMENT_NOUNS.find(([pattern]) =>
      pattern.test(product.title ?? ''),
    );
    return {label: garment?.[1] ?? CATEGORY_LABELS[type], bucket: 'apparel'};
  }
  // Say what the thing IS. "Accessories" covers laces, socks, beanies,
  // bracelets, sunglasses and shoe-care, and with one label for all of them
  // the generator fell back on the nearest shoe word it could find: the
  // 2026-09-20 dry run described "Fluffy Laces Pink" as "a slipper", "Adidas
  // Campus Laces White" as "an adidas sneaker" and a shoe brush as "a
  // sneaker". The title knows better than the product type does.
  const named = ACCESSORY_NOUNS.find(([pattern]) =>
    pattern.test(product.title ?? ''),
  );
  if (named) return {label: named[1], bucket: named[2] ?? 'other'};
  if (type === 'Accessories') return {label: 'accessory', bucket: 'other'};
  return {label: 'piece', bucket: 'other'};
}

/** Checked in order; the first garment word the title uses wins. */
const GARMENT_NOUNS = [
  [/t-?shirt|\btee\b|longsleeve|long sleeve/i, 'T-shirt'],
  [/hoodie|hooded sweat/i, 'hoodie'],
  [/\bjacket\b|windbreaker|\bcoat\b|puffer|\bvest\b/i, 'jacket'],
  [/jumpsuit/i, 'jumpsuit'],
  [/\boutfit\b|tracksuit|\bset\b/i, 'matching set'],
  [/\bshorts?\b|\bjorts?\b/i, 'pair of shorts'],
  [/\bjeans?\b|\bdenim\b(?! tears)|carpenter/i, 'pair of jeans'],
  [/sweatpants?|joggers?|track ?pants?/i, 'pair of sweatpants'],
  [/sweater|crewneck|sweatshirt/i, 'sweatshirt'],
];

/** Title pattern -> [noun, bucket]. English and the Dutch import titles. */
const ACCESSORY_NOUNS = [
  [/\b(laces?|veters)\b/i, 'set of laces'],
  [/\bsocks?\b|\bsokken\b/i, 'pack of socks'],
  [/sunglasses|\bglasses\b|zonnebril/i, 'pair of sunglasses'],
  [/bracelet|armband/i, 'bracelet'],
  [/necklace|\bchain\b|ketting/i, 'necklace'],
  [/balaclava/i, 'balaclava'],
  [/beanie|muts\b/i, 'beanie'],
  [/6-?panel|5-?panel|\bcap\b|\bhat\b|\bpet\b/i, 'cap'],
  [/face mask/i, 'face mask'],
  [/cardholder|card holder|wallet|portemonnee/i, 'cardholder'],
  [/\bbelt\b|riem\b/i, 'belt'],
  [/\bscarf\b|sjaal/i, 'scarf'],
  [/bambino|chiquito|turismo|bambimou|\bbag\b|duffle|backpack|\btote\b/i, 'bag', 'carry'],
  [/shoe brush|schoenborstel|\bbrush\b/i, 'shoe brush'],
  [/microvezel|microfib(re|er)|\bcloth\b|\bdoek\b/i, 'cleaning cloth'],
  [/\bgum\b|eraser/i, 'suede eraser'],
  [/crease|shields?/i, 'pair of crease protectors'],
];

/**
 * The model tag repeats the brand — `model:jacquemus-bambino` — so the
 * generated sentence stuttered: "From the Jacquemus Bambino line: the
 * Jacquemus Le Grand Bambino Python light". Strip the brand, and drop the
 * clause entirely when the title already contains the model, which it
 * usually does.
 */
function modelClause(model, brand, title) {
  if (!model) return null;
  // `model:shoelaces`, `model:caps-hats` and `model:bags` are shelf names the
  // accessory collections run on, not product lines. "A Supreme beanie, part
  // of the Caps Hats line" is what they produced.
  if (/^(shoelaces|caps hats|bags)$/i.test(model.trim())) return null;
  const stripped = brand
    ? model.replace(new RegExp(`^${brand}\\s+`, 'i'), '').trim()
    : model;
  if (!stripped) return null;
  // Substring matching was too strict. "Nike Dunk" is not a substring of
  // "Nike SB Dunk Low Travis Scott", so the clause survived and stuttered:
  // "From the Nike Dunk line: the Nike SB Dunk Low Travis Scott". Compare
  // word sets instead, and drop the clause once most of the model already
  // appears in the title — which also catches "From the Air Jordan 4 line:
  // the Jordan 4 Retro ...".
  const words = (value) =>
    value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const titleWords = new Set(words(title));
  const modelWords = words(stripped);
  if (!modelWords.length) return null;
  const overlap =
    modelWords.filter((word) => titleWords.has(word)).length / modelWords.length;
  if (overlap >= 0.6) return null;
  return stripped;
}

/**
 * Shipping and returns copy. Source of truth is `SHOP` in app/data/shop.ts —
 * free on EVERY order worldwide, no minimum, 14-day returns. Hardcoded here
 * because this is a .mjs script and that file is TypeScript; the previous
 * generator hardcoded "free over €50" and drifted, which is exactly what the
 * `stale` classification above exists to clean up. If the policy changes,
 * change it here too.
 */
const SHIPPING_LINE =
  'Free tracked shipping worldwide on every order, no minimum — 14-day returns';

/**
 * Deterministic copy variation.
 *
 * The first pass rewrote 577 products, where one sentence shape was fine.
 * Extending to the 8,403 `boilerplate` products is a different problem: those
 * are already identical to each other, and replacing them with 8,403 copies
 * of ONE new shape would swap duplicate text for differently-duplicated text.
 * The slot values (brand, model, colourway, style code) would differ, but
 * every page would still open and close with the same sentence.
 *
 * So the shape rotates too. `seedOf` hashes the product handle, which means a
 * product always renders the same variant — the script stays idempotent and a
 * re-run produces no diff — while across the catalogue the openers and
 * closers spread evenly.
 *
 * Every variant states the same facts. Nothing here claims more than
 * `app/data/shop.ts` and the policy pages already do: sourced through the
 * partner network, checked by hand, brand new and unworn, free tracked
 * shipping, 14-day returns. Do not add scarcity or authenticity claims.
 */
/**
 * "a" or "an" by SOUND, not spelling. Brand names break the naive
 * first-letter rule in both directions — "an adidas sneaker" but "a UGG
 * boot" — and the catalogue is mostly brand names, so the exceptions matter
 * more here than the rule does.
 */
/**
 * Brands whose own styling `titleCase` destroys. Cosmetic, but it shows on
 * every page that mentions them — "a Ugg slipper" appeared 558 times in the
 * dry run — and a brand name written wrong reads as carelessness on a store
 * whose whole pitch is that the goods are genuine.
 */
const BRAND_DISPLAY = {
  ugg: 'UGG',
  asics: 'ASICS',
  adidas: 'adidas',
  kaws: 'KAWS',
  bape: 'BAPE',
  nocta: 'NOCTA',
  mschf: 'MSCHF',
  gmbh: 'GmbH',
  'off white': 'Off-White',
  'off-white': 'Off-White',
  'a bathing ape': 'A Bathing APE',
  nigo: 'NIGO',
  awge: 'AWGE',
};

const brandLabel = (value) =>
  value ? (BRAND_DISPLAY[value.toLowerCase()] ?? value) : value;

// Model tags carry the brand as their first word or two, and titleCase() had
// been rendering it its own way: "Brand: UGG" directly above "Model: Ugg
// Classic". Fix the head of the model with the same map.
const modelLabel = (value) => {
  if (!value) return value;
  const words = value.split(/\s+/);
  for (let take = Math.min(3, words.length); take >= 1; take -= 1) {
    const head = words.slice(0, take).join(' ').toLowerCase();
    if (BRAND_DISPLAY[head]) {
      return [BRAND_DISPLAY[head], ...words.slice(take)].join(' ');
    }
  }
  return value;
};

function article(phrase) {
  const first = (phrase ?? '').trim().split(/\s+/)[0] ?? '';
  const lower = first.toLowerCase();
  // Vowel letter, consonant sound.
  if (/^(uni|use|user|uk|ugg|eu|one|once)/.test(lower)) return 'a';
  // Consonant letter, vowel sound — initialisms read letter by letter.
  if (/^(hour|honest|heir)/.test(lower)) return 'an';
  if (/^[FHLMNRSX]$/.test(first[0] ?? '') && first === first.toUpperCase() && first.length <= 4) {
    return 'an';
  }
  return /^[aeiou]/.test(lower) ? 'an' : 'a';
}

function seedOf(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const pick = (list, seed) => list[seed % list.length];

const SHOE_CLOSERS = [
  'Sourced through our partner network and inspected by hand — material, box, labels and finishing — before it ships.',
  'Every pair passes through our own hands first: material, finishing, box and labels are checked before dispatch.',
  'Sourced through our partner network, then checked piece by piece — material, stitching, box and labels — before it ships.',
  'We look over each pair ourselves before it leaves us, from the material and finishing down to the box and labels.',
  'Checked by hand before dispatch — material, finishing, box and labels — after being sourced through our partner network.',
];

const SOFT_CLOSERS = [
  'Sourced through our partner network and checked by hand before it ships.',
  'Sourced through our partner network, then checked by hand before dispatch.',
  'Each piece is checked by hand before it leaves us.',
  'We check every piece ourselves before it ships.',
  'Sourced through our partner network and looked over by hand before dispatch.',
];

/**
 * Three ways to say the same thing. Each receives the facts a product
 * actually has — any of them may be null — and must read correctly when the
 * thin ones are missing, which is why every part is filtered before joining.
 */
function openingSentence({title, collab, brand, category, colour, model}, seed) {
  // When the brand is unknown, say nothing about it. The fallback used to be
  // 'Fast Sneakers', which turned "Dunk Low Phantom" into "a Vespera
  // Collectives sneaker" on 86 products — describing Nike's shoe as our own.
  // Article 15 of the terms says the opposite in as many words: "Vespera
  // Collectives is an independent reseller and is not affiliated with any
  // brands." Bare category it is.
  // "a Nike pair of shorts" -> "a pair of Nike shorts". Counted nouns carry
  // the brand on the thing, not on the counter.
  const counted = /^(pair|set|pack) of (.+)$/.exec(category);
  const head = collab
    ? `${collab} release`
    : brand
      ? counted
        ? `${counted[1]} of ${brand} ${counted[2]}`
        : `${brand} ${category}`
      : category;
  const subject = `${article(head)} ${head}`;

  const shapes = [
    () =>
      [`The ${title} is`, subject, colour ? `in ${colour}` : null, model ? `from the ${model} line` : null]
        .filter(Boolean)
        .join(' '),
    () =>
      [`${title} —`, subject, colour ? `in ${colour}` : null, model ? `, part of the ${model} line` : null]
        .filter(Boolean)
        .join(' ')
        .replace(' ,', ','),
    () =>
      [
        model ? `From the ${model} line:` : 'New in:',
        `the ${title},`,
        subject,
        colour ? `in ${colour}` : null,
      ]
        .filter(Boolean)
        .join(' ')
        .replace(/,\s*$/, ''),
  ];

  return pick(shapes, seed)();
}

function describe(product) {
  const tags = product.tags ?? [];
  // The shop's own name in the vendor field is a placeholder, not a maker.
  // It reached the page twice on unbranded products — "a Fast Sneakers
  // accessory" in the sentence and "Brand: Fast Sneakers" in the specs —
  // on goods the terms say we only resell.
  const vendor = /^(vespera[- ]?collectives?|easyhairkit|sneakerask)$/i.test(
    (product.vendor ?? '').trim(),
  )
    ? ''
    : (product.vendor ?? '');
  const brand =
    brandLabel(titleCase(tagValue(tags, 'brand:') ?? vendor)) || null;
  const model = modelLabel(titleCase(tagValue(tags, 'model:') ?? '')) || null;
  const rawCollab = brandLabel(titleCase(tagValue(tags, 'collab:') ?? '')) || null;
  // Jacquemus carries both `brand:jacquemus` and `collab:jacquemus`, which
  // produced "a Jacquemus release" — brand twice, product type never. A
  // collab with yourself is not a collab.
  const collab =
    rawCollab && brand && rawCollab.toLowerCase() === brand.toLowerCase()
      ? null
      : rawCollab;
  const colour = titleCase((tagValue(tags, 'color:') ?? '').replace(/-/g, ' ')) || null;
  const {label: category, bucket} = categoryOf(product);
  const isShoe = bucket === 'shoe';
  const {sku, colorway} = salvage(product.descriptionHtml);
  const range = sizeRange(tags);

  // Shape AND slots vary, keyed on the handle — see seedOf above for why.
  const seed = seedOf(product.handle ?? product.title ?? '');
  const opener = openingSentence(
    {
      title: esc(product.title),
      collab: collab ? esc(collab) : null,
      brand: brand ? esc(brand) : null,
      category,
      colour: colour ? esc(colour.toLowerCase()) : null,
      model: (() => {
        const clause = modelClause(model, brand, product.title ?? '');
        return clause ? esc(clause) : null;
      })(),
    },
    seed,
  );

  const closer = pick(isShoe ? SHOE_CLOSERS : SOFT_CLOSERS, seed >>> 3);

  const specs = [
    brand ? `<li><strong>Brand:</strong> ${esc(brand)}</li>` : null,
    model && !/^(shoelaces|caps hats|bags)$/i.test(model)
      ? `<li><strong>Model:</strong> ${esc(model)}</li>`
      : null,
    colorway
      ? `<li><strong>Colourway:</strong> ${esc(colorway)}</li>`
      : colour
        ? `<li><strong>Colour:</strong> ${esc(colour)}</li>`
        : null,
    sku ? `<li><strong>Style code:</strong> ${esc(sku)}</li>` : null,
    range ? `<li><strong>Sizes:</strong> ${esc(range)}</li>` : null,
    `<li><strong>Condition:</strong> Brand new, unworn, in original packaging</li>`,
    bucket === 'shoe'
      ? `<li><strong>Sizing:</strong> Listed in EU sizing — see the size guide for US and UK conversions</li>`
      : bucket === 'apparel'
        ? `<li><strong>Fit:</strong> Relaxed streetwear cut, true to size — size down for a slimmer fit</li>`
        : null,
    `<li><strong>Shipping:</strong> ${SHIPPING_LINE}</li>`,
  ].filter(Boolean);

  // Shapes 2 and 3 already end in their own punctuation.
  const lead = /[.!?]$/.test(opener) ? opener : `${opener}.`;
  return [`<p>${lead} ${closer}</p>`, '<ul>', ...specs, '</ul>'].join('\n');
}

// ----------------------------------------------------------------- queries --

const PRODUCTS = `
  query Products($cursor: String) {
    products(first: 50, after: $cursor, query: "${
      INCLUDE_DRAFTS ? 'status:active OR status:draft' : 'status:active'
    }") {
      pageInfo { hasNextPage endCursor }
      nodes { id title handle vendor productType tags descriptionHtml }
    }
  }
`;

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

async function main() {
  console.log(
    `${APPLY ? 'APPLYING' : 'DRY RUN'} — descriptions on ${SHOP}` +
      (ONLY ? ` (only: ${[...ONLY].join(', ')})` : ''),
  );

  const planned = [];
  const counts = {empty: 0, thin: 0, dutch: 0, stale: 0, boilerplate: 0, regen: 0, kept: 0};
  let unchanged = 0;
  let cursor = null;
  let scanned = 0;

  while (planned.length < LIMIT) {
    const data = await gql(PRODUCTS, {cursor});
    const page = data.products;

    for (const product of page.nodes) {
      scanned += 1;
      if (HANDLES && !HANDLES.has(product.handle)) continue;
      const reason = classify(product.descriptionHtml);
      if (!reason) {
        counts.kept += 1;
        continue;
      }
      counts[reason] += 1;

      const wanted = ONLY
        ? ONLY.has(reason)
        : reason === 'regen'
          ? REGENERATE
          : reason === 'boilerplate'
            ? INCLUDE_BOILERPLATE || Boolean(HANDLES)
            : true;
      if (!wanted) continue;

      const next = describe(product);
      // Never write a value identical to the one already there. This is what
      // makes --regenerate cheap: it plans only the products an improvement
      // to describe() actually changed.
      // Compare flattened: the stored copy differs from what we wrote only
      // in Shopify's own line breaks, and a whitespace diff is not a change.
      if (flatten(next) === flatten(product.descriptionHtml)) {
        unchanged += 1;
        continue;
      }
      planned.push({product, reason, next});
      if (planned.length >= LIMIT) break;
    }

    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }

  writeFileSync(
    new URL('../improve-descriptions-report.csv', import.meta.url),
    ['id,handle,title,reason,new_description']
      .concat(
        planned.map(({product, reason, next}) =>
          [product.id, product.handle, product.title, reason, stripTags(next)]
            .map(csvCell)
            .join(','),
        ),
      )
      .join('\n') + '\n',
  );

  console.log(
    `Scanned ${scanned}; rewriting ${planned.length}. ` +
      `empty ${counts.empty}, thin ${counts.thin}, dutch ${counts.dutch}, ` +
      `stale ${counts.stale}, boilerplate ${counts.boilerplate}` +
      `${INCLUDE_BOILERPLATE || HANDLES || ONLY?.has('boilerplate') ? '' : ' (skipped)'}, ` +
      `previously generated ${counts.regen}` +
      `${REGENERATE || ONLY?.has('regen') ? '' : ' (skipped)'}, ` +
      `already current ${unchanged}, already fine ${counts.kept}.`,
  );
  console.log('Wrote improve-descriptions-report.csv');

  if (!APPLY) {
    for (const {product, reason, next} of planned.slice(0, 2)) {
      console.log(`\n--- ${reason}: ${product.title}\n${next}`);
    }
    console.log('\nDry run. Read the report, then re-run with --apply.');
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  writeFileSync(
    new URL(`../improve-descriptions-rollback-${stamp}.csv`, import.meta.url),
    ['id,handle,reason,previous_description_html']
      .concat(
        planned.map(({product, reason}) =>
          [product.id, product.handle, reason, product.descriptionHtml]
            .map(csvCell)
            .join(','),
        ),
      )
      .join('\n') + '\n',
  );
  console.log(`Wrote improve-descriptions-rollback-${stamp}.csv`);

  // Aliased batches: one round trip per 10 products rather than per product.
  // 10 keeps the document small enough that a long description cannot push
  // the request past the cost budget.
  const BATCH = 10;
  let written = 0;
  let failed = 0;

  for (let i = 0; i < planned.length; i += BATCH) {
    const slice = planned.slice(i, i + BATCH);
    const aliases = slice
      .map(
        ({product, next}, n) =>
          `u${n}: productUpdate(product: {id: ${JSON.stringify(product.id)}, ` +
          `descriptionHtml: ${JSON.stringify(next)}}) { userErrors { message } }`,
      )
      .join('\n');

    const data = await gql(`mutation {\n${aliases}\n}`);
    for (const key of Object.keys(data)) {
      const errors = data[key]?.userErrors ?? [];
      if (errors.length) {
        failed += 1;
        console.error(`  userError: ${errors[0].message}`);
      } else {
        written += 1;
      }
    }
    if (written % 500 < BATCH) console.log(`  ${written} rewritten…`);
  }

  console.log(`\nDone. ${written} descriptions rewritten, ${failed} errors.`);
  console.log(
    'Google re-crawls over days to weeks. Watch "Discovered - currently ' +
      'not indexed" in Search Console, and re-run set-google-attributes.mjs ' +
      'afterwards if any colour was being read from the old Colorway lines.',
  );
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export {classify, isDutch, isBoilerplate, describe, sizeRange, salvage};
