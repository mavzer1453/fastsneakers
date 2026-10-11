#!/usr/bin/env node
/**
 * 28 Sep 2026 — remove the placeholder line "Colourway: TBD" from product
 * descriptions (reviewers read it as an unfinished store). ONLY that list
 * item is removed; the rest of every description is left exactly as it is.
 *
 *   node scripts/remove-tbd-colourway.mjs            # dry run: count + preview
 *   node scripts/remove-tbd-colourway.mjs --apply    # writes; rollback CSV first
 *
 * Rollback: tbd-colourway-rollback-<ts>.csv (productId, full old descriptionHtml).
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
const APPLY = process.argv.includes('--apply');
const {gql} = createAdminClient({
  shop: (process.env.SHOPIFY_SHOP || process.env.PUBLIC_STORE_DOMAIN).replace(/\.myshopify\.com$/, ''),
  clientId: process.env.SHOPIFY_CLIENT_ID,
  clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
  apiVersion: '2025-07',
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

// <li><strong>Colourway:</strong> TBD</li> — Shopify reformats HTML on save,
// so allow whitespace/newlines anywhere, "Color"/"Colour", "way"/"Way".
const TBD_LI = /<li>\s*<strong>\s*Colou?rway:?\s*<\/strong>\s*:?\s*TBD\s*<\/li>\s*/gi;

const start = await gql(`mutation {
  bulkOperationRunQuery(query: """
    { products { edges { node { id handle descriptionHtml } } } }
  """) { bulkOperation { id } userErrors { message } }
}`);
const errs = start.bulkOperationRunQuery?.userErrors;
if (errs?.length) throw new Error(JSON.stringify(errs));
const opId = start.bulkOperationRunQuery.bulkOperation.id;
let url;
for (;;) {
  await sleep(4000);
  const s = await gql(
    `query($id: ID!) { node(id: $id) { ... on BulkOperation { status objectCount url errorCode } } }`,
    {id: opId},
  );
  process.stdout.write(`\r  exporting descriptions: ${s.node.status} ${s.node.objectCount}   `);
  if (s.node.status === 'COMPLETED') { url = s.node.url; break; }
  if (['FAILED', 'CANCELED', 'EXPIRED'].includes(s.node.status)) throw new Error(s.node.errorCode);
}
console.log();
const products = url
  ? (await (await fetch(url)).text()).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : [];

const hits = products
  .filter((p) => new RegExp(TBD_LI.source, 'i').test(p.descriptionHtml ?? ''))
  .map((p) => ({...p, fixed: p.descriptionHtml.replace(TBD_LI, '')}));
console.log(`${hits.length} descriptions contain "Colourway: TBD".`);
for (const h of hits.slice(0, 3)) console.log(`  e.g. ${h.handle}`);
if (!APPLY) {
  console.log('Dry run — nothing changed. Re-run with --apply.');
  process.exit(0);
}

const rollbackFile = `tbd-colourway-rollback-${ts}.csv`;
writeFileSync(rollbackFile, ['productId,handle,descriptionHtml'].concat(hits.map((h) => [h.id, h.handle, h.descriptionHtml].map(csvCell).join(','))).join('\n'));
console.log(`Rollback written: ${rollbackFile}`);

let failed = 0;
for (const [i, h] of hits.entries()) {
  try {
    const r = await gql(
      `mutation($id: ID!, $html: String!) { productUpdate(product: {id: $id, descriptionHtml: $html}) { userErrors { message } } }`,
      {id: h.id, html: h.fixed},
    );
    if (r.productUpdate?.userErrors?.length) throw new Error(JSON.stringify(r.productUpdate.userErrors));
  } catch (error) {
    failed++;
    console.error(`\n${h.handle}: ${error.message}`);
  }
  if ((i + 1) % 25 === 0 || i + 1 === hits.length) process.stdout.write(`\r${i + 1}/${hits.length}`);
}
console.log(`\nDone: ${hits.length - failed} descriptions fixed, ${failed} failed.`);
