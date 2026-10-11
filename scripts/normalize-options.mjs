#!/usr/bin/env node
/**
 * Give every size option the same name, so Shopify can offer ONE size filter.
 *
 * Why this matters more than it sounds:
 *
 * Shopify returns at most 100 values for the tag filter. Our `size:` tags eat
 * 60 of those slots, which leaves room for only 6 brands — so Puma, Salomon,
 * Vans, Crocs, Supreme and the rest are invisible in the brand filter even
 * though every product is tagged and collected correctly.
 *
 * The fix is to stop filtering sizes through tags and use the variant option
 * instead, which has its own separate budget. But Shopify creates one filter
 * per option NAME, and ours are split across Maat / Mate / Size / Schoenmaat
 * and a long tail of one-offs — which would produce a mess of near-duplicate
 * filters. Hence this: one name everywhere.
 *
 * "Size" is the name, and it is not a style choice: Google Merchant Center
 * reads the variant option NAME as the `size` attribute, so anything else
 * leaves every offer with a "Missing size" warning. The catalogue was
 * renamed off the Dutch "Maat" on 2026-09-19 (9,520 products); "Mate" was a
 * typo that propagated. Do not rename it back.
 *
 * Only renames options that are clearly size options. Colour options and
 * genuinely different axes are left alone.
 *
 * Usage:
 *   node scripts/normalize-options.mjs                 # dry run + report
 *   node scripts/normalize-options.mjs --apply
 *   node scripts/normalize-options.mjs --apply --limit=50
 *   node scripts/normalize-options.mjs --name="Size"   # pick a different name
 */

import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {URLSearchParams} from 'node:url';

// ---------------------------------------------------------------- config ---

const ENV_PATH = new URL('../.env', import.meta.url);
if (existsSync(ENV_PATH)) {
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    if (!line.includes('=') || line.trimStart().startsWith('#')) continue;
    const i = line.indexOf('=');
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (!value || process.env[key]) continue;
    process.env[key] = value;
  }
}

const SHOP = (process.env.SHOPIFY_SHOP || process.env.PUBLIC_STORE_DOMAIN || '')
  .trim()
  .replace(/\.myshopify\.com$/, '');
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const APPLY = process.argv.includes('--apply');
const TARGET =
  (process.argv.find((a) => a.startsWith('--name=')) ?? '').slice(7) || 'Size';
const LIMIT = Number.parseInt(
  (process.argv.find((a) => a.startsWith('--limit=')) ?? '').slice(8),
  10,
);
const API_VERSION = '2025-07';

if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET in .env');
  process.exit(1);
}

/**
 * Names that mean "size". Deliberately broad, because the catalogue carries
 * things like "ESS HOODIE (Size)" and "Portrait Knitsweater (Maat)".
 */
const SIZE_NAME =
  /^(maat|mate|size|sizes|schoenmaat|shoe ?size|größe|grosse|taille|talla)$|\(\s*(size|maat)\s*\)|size\b/i;

/** Names that are definitely NOT sizes, even if the pattern above is loose. */
const NOT_SIZE = /^(colou?r|kleur|farbe|metal colou?r|style|material|variant|title)$/i;

/**
 * A size option's values look like sizes: 42, 42.5, 36 2/3, XS..XXXL, ONESIZE.
 * Checking the values as well as the name stops us renaming a colour option
 * that happens to be called something odd.
 */
const SIZE_VALUE = /^(\d{1,2}([.,]\d)?(\s*\d\/\d)?(\s*eu)?|x{0,3}[sml]|xx?l|one ?size|os|\d{1,2}[-–]\d{1,2})$/i;

function looksLikeSizeOption(option) {
  const name = (option.name ?? '').trim();
  if (NOT_SIZE.test(name)) return false;
  if (SIZE_NAME.test(name)) return true;
  // Unnamed or oddly named, but the values are unmistakably sizes.
  const values = option.optionValues.map((v) => v.name.trim());
  if (values.length < 2) return false;
  const hits = values.filter((v) => SIZE_VALUE.test(v)).length;
  return hits / values.length >= 0.8;
}

// ------------------------------------------------------------- admin api ---

const ENDPOINT = `https://${SHOP}.myshopify.com/admin/api/${API_VERSION}/graphql.json`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let token = null;
let tokenExpiresAt = 0;

async function getToken() {
  if (token && Date.now() < tokenExpiresAt - 60_000) return token;
  const res = await fetch(`https://${SHOP}.myshopify.com/admin/oauth/access_token`, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`Token request failed (${res.status})`);
  const {access_token, expires_in, scope} = await res.json();
  if (!/write_products/.test(scope ?? '')) {
    throw new Error(`App lacks write_products (granted: ${scope || 'none'})`);
  }
  token = access_token;
  tokenExpiresAt = Date.now() + expires_in * 1000;
  return token;
}

async function admin(query, variables = {}, attempt = 0) {
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'X-Shopify-Access-Token': await getToken()},
      body: JSON.stringify({query, variables}),
    });
  } catch (error) {
    if (attempt >= 6) throw error;
    await sleep(2000 * (attempt + 1));
    return admin(query, variables, attempt + 1);
  }
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 6) throw new Error(`Admin API ${res.status}`);
    await sleep(2000 * (attempt + 1));
    return admin(query, variables, attempt + 1);
  }
  const json = await res.json();
  if (json.errors) {
    if (json.errors.some((e) => e.extensions?.code === 'THROTTLED') && attempt < 6) {
      await sleep(2000 * (attempt + 1));
      return admin(query, variables, attempt + 1);
    }
    throw new Error(`GraphQL: ${JSON.stringify(json.errors).slice(0, 300)}`);
  }
  const throttle = json.extensions?.cost?.throttleStatus;
  if (throttle && throttle.currentlyAvailable < 300) await sleep(1000);
  return json.data;
}

const PRODUCTS = `
  query Products($cursor: String) {
    products(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        title
        options(first: 5) {
          id
          name
          optionValues { name }
        }
      }
    }
  }
`;

const RENAME = `
  mutation Rename($productId: ID!, $option: OptionUpdateInput!) {
    productOptionUpdate(productId: $productId, option: $option) {
      userErrors { field message }
    }
  }
`;

// ------------------------------------------------------------------ main ---

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

async function main() {
  console.log(`\nNormalise size option names -> "${TARGET}"  (${APPLY ? 'APPLY' : 'DRY RUN'})\n`);

  const products = [];
  let cursor = null;
  for (;;) {
    const data = await admin(PRODUCTS, {cursor});
    products.push(...data.products.nodes);
    process.stdout.write(`\r  loaded ${products.length} products`);
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }
  process.stdout.write('\n');

  const plan = [];
  const fromNames = {};
  const skipped = {alreadyRight: 0, noSizeOption: []};

  for (const p of products) {
    const option = p.options.find(looksLikeSizeOption);
    if (!option) {
      skipped.noSizeOption.push(`${p.handle} [${p.options.map((o) => o.name).join(', ')}]`);
      continue;
    }
    if (option.name === TARGET) {
      skipped.alreadyRight++;
      continue;
    }
    fromNames[option.name] = (fromNames[option.name] ?? 0) + 1;
    plan.push({
      id: p.id,
      handle: p.handle,
      optionId: option.id,
      from: option.name,
      sample: option.optionValues.slice(0, 3).map((v) => v.name).join(' / '),
    });
  }

  console.log(`\n  already "${TARGET}"     : ${skipped.alreadyRight}`);
  console.log(`  to rename          : ${plan.length}`);
  console.log(`  no size option     : ${skipped.noSizeOption.length}`);

  if (plan.length) {
    console.log('\nRenaming from');
    for (const [name, n] of Object.entries(fromNames).sort((a, b) => b[1] - a[1]).slice(0, 20)) {
      console.log(`  ${JSON.stringify(name).padEnd(34)} ${n}`);
    }
  }

  const report = [
    ['handle', 'from_option', 'to_option', 'sample_values'].join(','),
    ...plan.map((x) => [x.handle, x.from, TARGET, x.sample].map(csvCell).join(',')),
  ].join('\n');
  writeFileSync(new URL('../normalize-options-report.csv', import.meta.url), report + '\n');
  console.log('\nWrote normalize-options-report.csv');

  if (skipped.noSizeOption.length) {
    writeFileSync(
      new URL('../normalize-options-skipped.txt', import.meta.url),
      skipped.noSizeOption.join('\n') + '\n',
    );
    console.log('Wrote normalize-options-skipped.txt — products with no size-like option');
  }

  const batch = Number.isFinite(LIMIT) ? plan.slice(0, LIMIT) : plan;

  if (!APPLY) {
    console.log('\nDry run — nothing renamed. Re-run with --apply.\n');
    return;
  }

  console.log(`\nRenaming ${batch.length}...`);
  const failures = [];
  let done = 0;

  for (const item of batch) {
    try {
      const data = await admin(RENAME, {
        productId: item.id,
        option: {id: item.optionId, name: TARGET},
      });
      const errs = data.productOptionUpdate.userErrors;
      if (errs.length) failures.push(`${item.handle}: ${errs.map((e) => e.message).join('; ')}`);
    } catch (error) {
      failures.push(`${item.handle}: ${error.message}`);
    }
    done++;
    if (done % 20 === 0 || done === batch.length) {
      process.stdout.write(`\r  renamed ${done}/${batch.length}  (${failures.length} failed)`);
    }
  }
  process.stdout.write('\n');

  if (failures.length) {
    writeFileSync(
      new URL('../normalize-options-failures.txt', import.meta.url),
      failures.join('\n') + '\n',
    );
    console.log(`\n${failures.length} failed — see normalize-options-failures.txt`);
    process.exitCode = 1;
  } else {
    console.log('\nDone. Next: enable the size filter in Shopify Search & Discovery.\n');
  }
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
