#!/usr/bin/env node
/**
 * 28 Sep 2026 — find products whose FIRST image (the one Google uses) is too
 * small for Merchant Center (< 500×500 recommended). Report only: it never
 * changes anything.
 *
 * For each hit it names the largest other image in the gallery, so the fix
 * can be done with the existing script:
 *   node scripts/promote-larger-image.mjs --handles=a,b --apply
 * Look at the gallery first: "largest" is not always "best" (see that script).
 *
 * Promotional-overlay images (text/badges on the photo) can't be detected
 * automatically — Merchant Center lists them per product once the account-level
 * suspension is lifted.
 *
 *   node scripts/check-images.mjs   → images-<ts>-report.csv
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {createAdminClient} from './lib/admin.mjs';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  if (!line.includes('=') || line.trimStart().startsWith('#')) continue;
  const i = line.indexOf('=');
  const key = line.slice(0, i).trim();
  const value = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  if (value && !process.env[key]) process.env[key] = value;
}
const MIN = 500;
const {gql} = createAdminClient({
  shop: (process.env.SHOPIFY_SHOP || process.env.PUBLIC_STORE_DOMAIN).replace(/\.myshopify\.com$/, ''),
  clientId: process.env.SHOPIFY_CLIENT_ID,
  clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
  apiVersion: '2025-07',
});
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const rows = [];
let cursor = null;
let seen = 0;
for (;;) {
  const d = await gql(
    `query($c: String) { products(first: 50, after: $c, query: "status:active") {
      pageInfo { hasNextPage endCursor }
      nodes { handle title images(first: 10) { nodes { width height } } }
    } }`,
    {c: cursor},
  );
  for (const p of d.products.nodes) {
    seen++;
    // `images` (not `media`) needs only read_products, which the app has.
    const imgs = p.images.nodes.map((image) => ({image}));
    if (!imgs.length) {
      rows.push([p.handle, p.title, 'NO IMAGE', '', '']);
      continue;
    }
    const first = imgs[0].image;
    if (Math.min(first.width, first.height) >= MIN) continue;
    const best = imgs.slice(1).sort((a, b) =>
      Math.min(b.image.width, b.image.height) - Math.min(a.image.width, a.image.height))[0];
    rows.push([
      p.handle,
      p.title,
      `${first.width}x${first.height}`,
      best ? `${best.image.width}x${best.image.height}` : 'none',
      best && Math.min(best.image.width, best.image.height) >= MIN ? 'fix: promote-larger-image.mjs' : 'needs a new photo',
    ]);
  }
  process.stdout.write(`\r  ${seen} products checked, ${rows.length} with a small first image`);
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}
const file = `images-${ts}-report.csv`;
writeFileSync(file, ['handle,title,first_image,largest_other,action'].concat(rows.map((r) => r.map(csvCell).join(','))).join('\n'));
console.log(`\nReport: ${file}`);
