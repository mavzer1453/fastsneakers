#!/usr/bin/env node
/**
 * Diagnose why products show as "Sold out" on the storefront.
 *
 * The Admin API says every variant is available (untracked inventory,
 * policy CONTINUE, stocked at an active location, shipping zones cover the
 * market) — so if the storefront still reports unavailable, this script
 * pinpoints where the disagreement happens by querying YOUR Storefront API
 * exactly like the site does.
 *
 * Run from the project root (reads .env automatically):
 *   node scripts/check-availability.mjs [product-handle]
 */
import {readFileSync} from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => line.includes('=') && !line.startsWith('#'))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

const DOMAIN = env.PUBLIC_STORE_DOMAIN;
const TOKEN = env.PUBLIC_STOREFRONT_API_TOKEN;
const HANDLE = process.argv[2] ?? 'air-force-1-low-07-triple-black';
const API_VERSION = '2025-01';

if (!DOMAIN || !TOKEN) {
  console.error('Missing PUBLIC_STORE_DOMAIN / PUBLIC_STOREFRONT_API_TOKEN in .env');
  process.exit(1);
}

async function storefront(query, variables) {
  const response = await fetch(
    `https://${DOMAIN}/api/${API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': TOKEN,
      },
      body: JSON.stringify({query, variables}),
    },
  );
  return response.json();
}

const QUERY = `
  query Check($handle: String!, $country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    product(handle: $handle) {
      title
      availableForSale
      variants(first: 5) {
        nodes {
          title
          availableForSale
          quantityAvailable
          currentlyNotInStock
        }
      }
    }
  }
`;

console.log(`Store: ${DOMAIN}\nProduct handle: ${HANDLE}\n`);

for (const context of [
  {label: 'no @inContext', country: undefined, language: undefined},
  {label: '@inContext(country: NL, language: EN)', country: 'NL', language: 'EN'},
  {label: '@inContext(country: BE, language: EN)', country: 'BE', language: 'EN'},
]) {
  const json = await storefront(QUERY, {
    handle: HANDLE,
    country: context.country,
    language: context.language,
  });
  console.log(`— ${context.label}`);
  if (json.errors) {
    console.log('  ERRORS:', JSON.stringify(json.errors));
    continue;
  }
  const product = json.data?.product;
  if (!product) {
    console.log('  product: NOT FOUND for this token/channel!');
    continue;
  }
  console.log(`  product.availableForSale: ${product.availableForSale}`);
  for (const variant of product.variants.nodes) {
    console.log(
      `    ${variant.title}: availableForSale=${variant.availableForSale} quantityAvailable=${variant.quantityAvailable} currentlyNotInStock=${variant.currentlyNotInStock}`,
    );
  }
}

console.log(
  '\nIf availableForSale is false here but true in Shopify admin, the fix is\nusually: Shopify admin → Settings → Markets (make sure the market is\nactive), or restart `npm run dev` (Hydrogen caches storefront responses\nin dev). Send this output to Claude to get the exact fix.',
);
