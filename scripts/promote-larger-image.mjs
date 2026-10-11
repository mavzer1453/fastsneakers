#!/usr/bin/env node
/**
 * Make a product's largest image its first image.
 *
 * Why this exists:
 *
 * Merchant Center's "Image too small" (155 offers on 2026-09-20) came down to
 * four products whose FIRST image is under Google's 250px apparel minimum —
 * a 500×218 transparent cut-out, say — while a clean 1400×1000 studio shot of
 * the same product sits second in the gallery. Google only reads the first
 * image, so the fix is an order change, not a new photo.
 *
 * Handles are named explicitly, on purpose. "Largest" is not "best": the
 * bigger image on nike-dunk-low-smoke-grey is an in-hand photo taken in a
 * shop, which Google would reject for a different reason and no customer
 * should see first. Look at the gallery before you name a handle.
 *
 * Usage:
 *   node scripts/promote-larger-image.mjs --handles=a,b          # dry run
 *   node scripts/promote-larger-image.mjs --handles=a,b --apply
 *
 * Reversible: the dry run prints the current first image's id; moving that
 * id back to position 0 undoes it.
 */

import {existsSync, readFileSync} from 'node:fs';

import {createAdminClient} from './lib/admin.mjs';

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
const HANDLES = (
  process.argv.find((a) => a.startsWith('--handles='))?.slice(10) ?? ''
)
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

if (!HANDLES.length) {
  console.error('Pass --handles=handle-one,handle-two');
  process.exit(1);
}

const {gql} = createAdminClient({
  shop: SHOP,
  clientId: process.env.SHOPIFY_CLIENT_ID,
  clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
});

const PRODUCT = `
  query Product($query: String!) {
    products(first: 1, query: $query) {
      nodes {
        id
        handle
        media(first: 30) {
          nodes { id ... on MediaImage { image { width height } } }
        }
      }
    }
  }
`;

const REORDER = `
  mutation Reorder($id: ID!, $moves: [MoveInput!]!) {
    productReorderMedia(id: $id, moves: $moves) {
      job { id }
      mediaUserErrors { field message }
    }
  }
`;

const shortSide = (media) =>
  Math.min(media.image?.width ?? 0, media.image?.height ?? 0);

console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — promote largest image`);

for (const handle of HANDLES) {
  const data = await gql(PRODUCT, {query: `handle:${handle}`});
  const product = data.products.nodes[0];
  if (!product || product.handle !== handle) {
    console.log(`  ✗ ${handle}: not found`);
    continue;
  }
  const images = product.media.nodes.filter((m) => m.image);
  const first = images[0];
  const best = images.reduce((a, b) => (shortSide(b) > shortSide(a) ? b : a));
  const size = (m) => `${m.image.width}×${m.image.height}`;

  if (!first || best.id === first.id) {
    console.log(`  = ${handle}: first image is already the largest`);
    continue;
  }
  console.log(
    `  ${handle}: ${size(first)} (${first.id}) → ${size(best)} (${best.id})`,
  );
  if (!APPLY) continue;

  const result = await gql(REORDER, {
    id: product.id,
    moves: [{id: best.id, newPosition: '0'}],
  });
  const errors = result.productReorderMedia.mediaUserErrors;
  console.log(errors.length ? `    ✗ ${errors[0].message}` : '    ✓ reordered');
}
