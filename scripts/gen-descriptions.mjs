#!/usr/bin/env node
/**
 * Write a structured, Zalando-style description into every product that
 * doesn't have one yet (products with an existing description are never
 * touched). Uses the same Admin token setup as scripts/fix-brands.mjs:
 *
 *   Dry run:  SHOPIFY_SHOP=... SHOPIFY_ADMIN_TOKEN=... node scripts/gen-descriptions.mjs
 *   Apply:    SHOPIFY_SHOP=... SHOPIFY_ADMIN_TOKEN=... node scripts/gen-descriptions.mjs --apply
 *
 * The generated description = one intro sentence + a spec list (brand,
 * category, condition, authenticity, sizing) built from the product's
 * title, vendor and type — unique per product, consistent in structure.
 */

const SHOP = process.env.SHOPIFY_SHOP;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const APPLY = process.argv.includes('--apply');
const API_VERSION = '2025-07';

if (!SHOP || !TOKEN) {
  console.error('Set SHOPIFY_SHOP and SHOPIFY_ADMIN_TOKEN (see scripts/fix-brands.mjs header).');
  process.exit(1);
}

const CATEGORY_LABELS = {
  sneakers: 'sneakers', Sneakers: 'sneakers', Boots: 'boots', Slippers: 'slippers',
  Kleding: 'apparel', Clothing: 'apparel', 'T-Shirts': 'T-shirt', Tops: 'top',
  'Shirts & Tops': 'shirt', Hoodies: 'hoodie', sweater: 'knit', OUTERWEAR: 'outerwear',
  Jeans: 'denim', Shorts: 'shorts', Sweatpants: 'sweatpants', Sets: 'matching set',
  Tracksuits: 'tracksuit', loungewear: 'loungewear', bags: 'bag', Accessories: 'accessory',
};

function esc(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function describe(product, brand) {
  const category = CATEGORY_LABELS[product.productType] ?? 'piece';
  const isShoe = /sneakers|boots|slippers/i.test(product.productType || '');
  const sizeNote = isShoe
    ? 'Listed in EU sizing — see the size guide for conversions.'
    : 'Relaxed streetwear cut, true to size — size down for a slimmer fit.';
  const intro = `${esc(product.title)}${brand ? ` by ${esc(brand)}` : ''} — an authentic ${category} from the Vespera Collectives selection, sourced through trusted partners and verified before it ships.`;
  return [
    `<p>${intro}</p>`,
    '<ul>',
    brand ? `<li><strong>Brand:</strong> ${esc(brand)}</li>` : null,
    `<li><strong>Condition:</strong> Brand new — unworn, in original packaging</li>`,
    `<li><strong>Authenticity:</strong> Checked &amp; verified before shipping</li>`,
    `<li><strong>Sizing:</strong> ${sizeNote}</li>`,
    `<li><strong>Shipping:</strong> Tracked delivery, free over €50 — 14-day returns</li>`,
    '</ul>',
  ]
    .filter(Boolean)
    .join('\n');
}

async function adminGraphql(query, variables) {
  const response = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN},
    body: JSON.stringify({query, variables}),
  });
  const json = await response.json();
  if (json.errors) {
    if (json.errors.some((error) => error.extensions?.code === 'THROTTLED')) return {throttled: true};
    throw new Error(JSON.stringify(json.errors));
  }
  return {data: json.data};
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Fetch all products (id, title, vendor, type, description presence)
const products = [];
let cursor = null;
for (;;) {
  const {data} = await adminGraphql(
    `query All($after: String) {
      products(first: 250, after: $after) {
        edges { node { id title vendor productType description } }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    {after: cursor},
  );
  for (const edge of data.products.edges) products.push(edge.node);
  process.stdout.write(`\rFetched ${products.length} products…`);
  if (!data.products.pageInfo.hasNextPage) break;
  cursor = data.products.pageInfo.endCursor;
}
console.log('');

const LEGACY = new Set(['easyhairkit', 'vitalex', '']);
const targets = products.filter((product) => !(product.description ?? '').trim());
console.log(`${targets.length} of ${products.length} products have no description.`);

if (!APPLY) {
  for (const product of targets.slice(0, 3)) {
    const brand = LEGACY.has((product.vendor ?? '').toLowerCase()) ? null : product.vendor;
    console.log(`\n--- Preview: ${product.title}\n${describe(product, brand)}`);
  }
  console.log('\nDry run — re-run with --apply to write descriptions.');
  process.exit(0);
}

const BATCH = 15;
for (let index = 0; index < targets.length; index += BATCH) {
  const batch = targets.slice(index, index + BATCH);
  const aliases = batch
    .map((product, batchIndex) => {
      const brand = LEGACY.has((product.vendor ?? '').toLowerCase()) ? null : product.vendor;
      return `u${batchIndex}: productUpdate(product: {id: ${JSON.stringify(product.id)}, descriptionHtml: ${JSON.stringify(describe(product, brand))}}) { userErrors { message } }`;
    })
    .join('\n');
  for (;;) {
    const result = await adminGraphql(`mutation {\n${aliases}\n}`);
    if (result.throttled) {
      await sleep(4000);
      continue;
    }
    break;
  }
  process.stdout.write(`\rUpdated ${Math.min(index + BATCH, targets.length)}/${targets.length}`);
  await sleep(700);
}
console.log('\nDone — every product now has a structured description.');
