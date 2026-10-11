#!/usr/bin/env node
/**
 * Find copy that makes Google classify a live page as a "Soft 404".
 *
 * READ-ONLY. Writes nothing to Shopify — only soft404-copy-report.csv.
 *
 * Why this exists:
 *
 * The 2026-09-20 Search Console export listed 29 URLs as "Soft 404". Every
 * one of them answers 200 with a full product page, and genuinely missing
 * URLs already answer a hard 404 — so the server was never the problem. The
 * copy was. 8,394 imported products opened with:
 *
 *   "The <name> is exclusive and no longer available anywhere else. But at
 *    Fast Sneakers, yes!"
 *
 * "No longer available" in the first sentence of a product page is exactly
 * what Google's soft-404 classifier is trained to find: a 200 page that SAYS
 * the thing is gone. improve-descriptions.mjs rewrote that copy on 19
 * September, after the last of the 29 crawls (15 September).
 *
 * This script is the check that the phrase — and its cousins in the other
 * storefront languages — is really gone from everywhere Google reads it:
 * the description, the SEO title and the SEO description, on products AND
 * collections. Run it after any bulk import, because the importer's source
 * copy is where the phrase came from.
 *
 * Usage:
 *   node scripts/audit-soft404-copy.mjs
 */

import {existsSync, readFileSync, writeFileSync} from 'node:fs';

import {createAdminClient} from './lib/admin.mjs';
import {findSoft404Phrase} from './lib/soft404.mjs';

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
  console.error('Missing SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET in .env');
  process.exit(1);
}

const {gql} = createAdminClient({
  shop: SHOP,
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  apiVersion: '2025-07',
});

const PRODUCTS = `#graphql
  query Products($cursor: String) {
    products(first: 200, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { id handle status title descriptionHtml seo { title description } }
    }
  }
`;

const COLLECTIONS = `#graphql
  query Collections($cursor: String) {
    collections(first: 200, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { id handle title descriptionHtml seo { title description } }
    }
  }
`;

async function scan(kind, query, root) {
  const hits = [];
  let cursor = null;
  let seen = 0;
  do {
    const data = await gql(query, {cursor});
    const page = data[root];
    for (const node of page.nodes) {
      seen += 1;
      const fields = {
        description: node.descriptionHtml ?? '',
        seo_title: node.seo?.title ?? '',
        seo_description: node.seo?.description ?? '',
      };
      for (const [field, text] of Object.entries(fields)) {
        const excerpt = text && findSoft404Phrase(text);
        if (excerpt) {
          hits.push({
            kind,
            handle: node.handle,
            status: node.status ?? '',
            field,
            excerpt,
          });
        }
      }
    }
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    process.stderr.write(`\r${kind}: ${seen} scanned, ${hits.length} hits`);
  } while (cursor);
  process.stderr.write('\n');
  return {seen, hits};
}

const products = await scan('product', PRODUCTS, 'products');
const collections = await scan('collection', COLLECTIONS, 'collections');
const hits = [...products.hits, ...collections.hits];

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
writeFileSync(
  new URL('../soft404-copy-report.csv', import.meta.url),
  [
    'kind,handle,status,field,excerpt',
    ...hits.map((h) =>
      [h.kind, h.handle, h.status, h.field, h.excerpt].map(csvCell).join(','),
    ),
  ].join('\n') + '\n',
);

console.log(
  `\n${products.seen} products, ${collections.seen} collections scanned — ` +
    `${hits.length} soft-404 trigger phrase(s). See soft404-copy-report.csv`,
);
