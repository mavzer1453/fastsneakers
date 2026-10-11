#!/usr/bin/env node
/**
 * Replace "quality"-framed trust copy in product descriptions with the
 * authenticity wording the storefront now uses everywhere else.
 *
 * The storefront copy (app/data/shop.ts, TrustBar, FAQ, the authenticity
 * page) says "100% authentic, checked before shipping". Product descriptions
 * written by gen-descriptions.mjs / improve-descriptions.mjs still say
 * "quality checked", which reads like a hedge next to the rest of the site.
 *
 * Usage:
 *   node scripts/rewrite-quality-copy.mjs            # dry run + phrase report
 *   node scripts/rewrite-quality-copy.mjs --apply
 *   node scripts/rewrite-quality-copy.mjs --apply --limit=50
 */
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
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
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing SHOPIFY_SHOP / SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET in .env');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const LIMIT = Number(
  (process.argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || 0,
);

const {gql} = createAdminClient({shop: SHOP, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET});

/* Trust / verification copy only.
 *
 * "high-quality cotton blend" describes the garment the brand made and is
 * left alone — it is a product fact, not a claim about our checks. Only the
 * copy that frames OUR process as a quality check is rewritten, because on a
 * reseller storefront the thing the buyer is actually asking about is
 * authenticity. Pass --include-material to rewrite the descriptors too. */
const RULES = [
  [/\bunworn and quality[-\s]checked before it ships\b/gi, 'unworn and 100% authentic — checked before it ships'],
  [/\bquality[-\s]checked before (?:it )?ship(?:s|ping|ped)\b/gi, '100% authentic — checked before it ships'],
  [/\bquality[-\s]checked by hand\b/gi, 'checked by hand for authenticity'],
  [/\bchecked for quality before (?:it )?ship(?:s|ping|ped)\b/gi, 'checked for authenticity before it ships'],
  [/\bquality[-\s]checked\b/gi, '100% authentic'],
  [/\bquality[-\s]control(?:led|s)?\b/gi, 'authenticity check'],
  [/\bquality[-\s]check(?:s)?\b/gi, 'authenticity check'],
  [/\bchecked for quality\b/gi, 'checked for authenticity'],
];

/* Opt-in only — see the note above. */
const MATERIAL_RULES = [
  [/\b(?:high|top|best|superior)[-\s]quality\b/gi, 'premium'],
  [/\bpremium[-\s]quality\b/gi, 'premium'],
];

const MATERIAL_RE = /\b(?:high|top|premium|best|superior)[-\s]quality\b|\bquality (?:material|fabric|cotton|leather|construction|finish)/gi;

const INCLUDE_MATERIAL = process.argv.includes('--include-material');

function rewrite(html) {
  let out = html;
  for (const [re, to] of RULES) out = out.replace(re, to);
  if (INCLUDE_MATERIAL) for (const [re, to] of MATERIAL_RULES) out = out.replace(re, to);
  return out;
}

const QUERY = `
  query Products($cursor: String) {
    products(first: 100, after: $cursor) {
      edges { node { id title handle descriptionHtml } }
      pageInfo { hasNextPage endCursor }
    }
  }`;

const MUTATION = `
  mutation Update($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id }
      userErrors { field message }
    }
  }`;

const phrases = new Map();
const hits = [];
let materialOnly = 0;
let cursor = null;
let scanned = 0;

for (;;) {
  const json = await gql(QUERY, {cursor});
  const conn = json.data.products;
  for (const {node} of conn.edges) {
    scanned++;
    const html = node.descriptionHtml || '';
    if (!/quality/i.test(html)) continue;
    for (const m of html.match(/[^.<>]{0,45}quality[^.<>]{0,45}/gi) || []) {
      const k = m.trim().replace(/\s+/g, ' ');
      phrases.set(k, (phrases.get(k) || 0) + 1);
    }
    const next = rewrite(html);
    if (next === html && MATERIAL_RE.test(html)) materialOnly++;
    if (next !== html) hits.push({id: node.id, handle: node.handle, html: next});
  }
  if (!conn.pageInfo.hasNextPage) break;
  cursor = conn.pageInfo.endCursor;
  if (LIMIT && hits.length >= LIMIT) break;
}

const todo = LIMIT ? hits.slice(0, LIMIT) : hits;

console.log(`Scanned ${scanned} products — ${hits.length} contain "quality" copy that will change.`);
console.log('\nTop phrases found:');
for (const [p, n] of [...phrases].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
  console.log(`  ${String(n).padStart(5)}  ${p}`);
}
writeFileSync(new URL('../.tmp-quality-report.json', import.meta.url),
  JSON.stringify({scanned, changing: hits.length, phrases: [...phrases]}, null, 2));

/* Leftovers the rules did not catch — worth eyeballing before a rerun. */
console.log(`\n${materialOnly} products mention quality only as a material descriptor ("high-quality cotton") — left alone. Use --include-material to rewrite those too.`);

const leftover = todo.filter((h) => /quality/i.test(h.html)).length;
if (leftover) console.log(`\n⚠ ${leftover} descriptions still mention "quality" after rewriting.`);

if (!APPLY) {
  console.log('\nDry run. Re-run with --apply to write these to Shopify.');
  process.exit(0);
}

let done = 0;
for (const h of todo) {
  const res = await gql(MUTATION, {input: {id: h.id, descriptionHtml: h.html}});
  const errs = res.data?.productUpdate?.userErrors || [];
  if (errs.length) console.error(`  ${h.handle}: ${errs.map((e) => e.message).join('; ')}`);
  else done++;
  if (done % 100 === 0) console.log(`  updated ${done}/${todo.length}`);
}
console.log(`\nUpdated ${done}/${todo.length} product descriptions.`);
