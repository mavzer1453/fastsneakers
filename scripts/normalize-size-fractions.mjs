#!/usr/bin/env node
/**
 * Rewrite fractional EU sizes as halves: "38 2/3 EU" -> "39 EU".
 *
 * adidas, Yeezy, Salomon and HOKA size in thirds, and the feeds carry that
 * through in two spellings — "38 2/3 EU" on Gazelle and Salomon, "38.66 EU"
 * on HOKA. Meanwhile the Samba feed already rounds the same shoe to "39 EU".
 * So the catalogue speaks two dialects for one grid, and the picker showed
 * both.
 *
 * Both thirds collapse onto the half. The store does not want fractions in
 * the size picker or the filter at all, and .5 is the nearer half in both
 * directions anyway — 38 2/3 is 38.67, which is 0.17 from 38.5 and 0.33 from
 * 39.
 *
 *     36 2/3 -> 36.5    41 1/3 -> 41.5     46 2/3 -> 46.5
 *     37 1/3 -> 37.5    42 2/3 -> 42.5     47 1/3 -> 47.5
 *
 * This replaces an earlier rule that rounded each third UP to the next half
 * (36 2/3 -> 37), on the reasoning that it copied the Samba feed. It made
 * every 2/3 size a third of a size too big.
 *
 * Note what this deliberately does NOT do: it does not renumber the sizes
 * onto a gapless 36 / 36.5 / 37 ladder. adidas fits three sizes into every
 * two EU numbers, so a gapless ladder would run out of room and label the
 * largest shoe in an 18-size run as 44.5 when it is really 47 1/3 — a US 12.5
 * sold as a US 10.5. The gaps below (no 36.5, no 38.5, no 40.5) are sizes
 * adidas does not make, not sizes we are missing.
 *
 * Renaming an option value renames its variants. Orders already placed keep
 * their own line-item snapshots, so history is not rewritten.
 *
 * Usage:
 *   node scripts/normalize-size-fractions.mjs                    # dry run + report
 *   node scripts/normalize-size-fractions.mjs --apply --limit=1  # one product
 *   node scripts/normalize-size-fractions.mjs --apply
 *   node scripts/normalize-size-fractions.mjs --rollback=size-fractions-rollback-….csv
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
const LIMIT = Number.parseInt(
  (process.argv.find((a) => a.startsWith('--limit=')) ?? '').slice(8),
  10,
);
const ROLLBACK =
  (process.argv.find((a) => a.startsWith('--rollback=')) ?? '').slice(11) ||
  null;
const API_VERSION = '2025-07';

if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET in .env');
  process.exit(1);
}

// ------------------------------------------------------------- the rules ---

const NOT_SIZE =
  /^(colou?r|kleur|farbe|metal colou?r|style|material|variant|title)$/i;

/**
 * "38 2/3 EU" -> 38.667, "36.66 EU" -> 36.66. Only the two notations that
 * need rewriting; a plain "42.5 EU" returns null and is left alone.
 *
 * The trailing marker on "38 EU (Breed)" is preserved by the caller, so this
 * only has to read the number.
 */
function fractionalSize(value) {
  const cleaned = value.replace(/\([^)]*\)\s*$/, '').trim();

  // Thirds, and the handful of listings that write halves as "35 1/2" too.
  const fraction = /^(\d{1,2})\s+([12])\s*\/\s*([23])\s*(?:eur?)?$/i.exec(cleaned);
  if (fraction) {
    const numerator = Number(fraction[2]);
    const denominator = Number(fraction[3]);
    if (numerator < denominator) {
      return Number(fraction[1]) + numerator / denominator;
    }
  }

  // HOKA's decimal spelling of the same thirds: .33 and .66 / .67.
  const decimal = /^(\d{1,2})[.,](\d{2})\s*(?:eur?)?$/i.exec(cleaned);
  if (decimal) {
    const fraction = Number(`0.${decimal[2]}`);
    const isThird = Math.abs(fraction - 1 / 3) < 0.02;
    const isTwoThirds = Math.abs(fraction - 2 / 3) < 0.02;
    if (isThird || isTwoThirds) return Number(decimal[1]) + fraction;
  }

  return null;
}

/** Every third lands on the half of the number it already sits in. */
function roundedName(value) {
  const size = fractionalSize(value);
  if (size === null) return null;
  const rounded = Math.floor(size) + 0.5;
  const printed = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  // A handful of listings spell it EUR. Read either, write EU.
  const suffix = /\beur?\b/i.test(value) ? ' EU' : '';
  const marker = /\(([^)]*)\)\s*$/.exec(value);
  return `${printed}${suffix}${marker ? ` (${marker[1]})` : ''}`;
}

// ------------------------------------------------------------- admin api ---

const ENDPOINT = `https://${SHOP}.myshopify.com/admin/api/${API_VERSION}/graphql.json`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let token = null;
let tokenExpiresAt = 0;

async function getToken() {
  if (token && Date.now() < tokenExpiresAt - 60_000) return token;
  const res = await fetch(
    `https://${SHOP}.myshopify.com/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    },
  );
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
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': await getToken(),
      },
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
    if (
      json.errors.some((e) => e.extensions?.code === 'THROTTLED') &&
      attempt < 6
    ) {
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
          optionValues { id name }
        }
      }
    }
  }
`;

const RENAME = `
  mutation RenameValues(
    $productId: ID!
    $option: OptionUpdateInput!
    $values: [OptionValueUpdateInput!]
  ) {
    productOptionUpdate(
      productId: $productId
      option: $option
      optionValuesToUpdate: $values
      variantStrategy: LEAVE_AS_IS
    ) {
      userErrors { field message code }
    }
  }
`;

// ------------------------------------------------------------------ main ---

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function planFor(product) {
  for (const option of product.options) {
    if (NOT_SIZE.test((option.name ?? '').trim())) continue;

    const changes = [];
    for (const value of option.optionValues) {
      const next = roundedName(value.name);
      if (next && next !== value.name) {
        changes.push({id: value.id, from: value.name, to: next});
      }
    }
    if (!changes.length) continue;

    // A rename that lands on a name the option already has would merge two
    // variants into one and lose stock.
    //
    // This used to abandon the whole product on a single collision, which was
    // fine when collisions were theoretical. Under the current rule they are
    // routine: the adidas grid carries "35.5 EU" and "35 1/3 EU" side by side,
    // so 35 1/3 -> 35.5 collides on most adidas products — and dropping the
    // product would also abandon the 38 2/3 and 42 2/3 renames sitting next to
    // it, which are the whole point. Skip the colliding VALUE and keep the
    // rest.
    const existing = new Set(option.optionValues.map((v) => v.name));
    for (const change of changes) existing.delete(change.from);

    const collisions = [];
    const safe = [];
    for (const change of changes) {
      if (existing.has(change.to)) collisions.push(`${change.from} -> ${change.to}`);
      else safe.push(change);
    }
    if (!safe.length) return {collisions};

    return {optionId: option.id, optionName: option.name, changes: safe, collisions};
  }
  return null;
}

async function loadProducts() {
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
  return products;
}

async function rename(item, changes) {
  const data = await admin(RENAME, {
    productId: item.id,
    option: {id: item.optionId},
    values: changes.map((c) => ({id: c.id, name: c.to})),
  });
  const errs = data.productOptionUpdate.userErrors;
  if (errs.length) throw new Error(errs.map((e) => e.message).join('; '));
}

async function runRollback(path) {
  const rows = readFileSync(path, 'utf8').trim().split('\n').slice(1);
  const byProduct = new Map();
  for (const row of rows) {
    const cells = row.match(/"((?:[^"]|"")*)"/g).map((c) =>
      c.slice(1, -1).replace(/""/g, '"'),
    );
    const [, productId, optionId, valueId, from, to] = cells;
    if (!byProduct.has(productId)) {
      byProduct.set(productId, {id: productId, optionId, changes: []});
    }
    // Swap the direction: put the original name back.
    byProduct.get(productId).changes.push({id: valueId, from: to, to: from});
  }
  console.log(`\nRolling back ${byProduct.size} products from ${path}\n`);
  let done = 0;
  for (const item of byProduct.values()) {
    await rename(item, item.changes);
    done++;
    process.stdout.write(`\r  restored ${done}/${byProduct.size}`);
  }
  process.stdout.write('\n\nDone.\n');
}

async function main() {
  if (ROLLBACK) return runRollback(ROLLBACK);

  console.log(
    `\nFractional EU sizes -> halves  (${APPLY ? 'APPLY' : 'DRY RUN'})\n`,
  );

  const products = await loadProducts();

  const plan = [];
  const collisions = [];
  for (const product of products) {
    const result = planFor(product);
    if (!result) continue;
    for (const c of result.collisions ?? []) {
      collisions.push(`${product.handle}: ${c}`);
    }
    if (!result.changes?.length) continue;
    plan.push({
      id: product.id,
      handle: product.handle,
      title: product.title,
      optionId: result.optionId,
      changes: result.changes,
    });
  }

  const valueCount = plan.reduce((n, p) => n + p.changes.length, 0);
  console.log(`\n  products to change : ${plan.length}`);
  console.log(`  size values        : ${valueCount}`);
  console.log(`  skipped, collision : ${collisions.length}`);

  if (plan.length) {
    const sample = plan[0];
    console.log(`\nExample — ${sample.title}`);
    for (const change of sample.changes.slice(0, 6)) {
      console.log(`  ${change.from.padEnd(14)} -> ${change.to}`);
    }
    if (sample.changes.length > 6) {
      console.log(`  … ${sample.changes.length - 6} more`);
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const rollbackPath = new URL(
    `../size-fractions-rollback-${stamp}.csv`,
    import.meta.url,
  );
  const rollback = [
    ['handle', 'product_id', 'option_id', 'value_id', 'from', 'to'].join(','),
    ...plan.flatMap((p) =>
      p.changes.map((c) =>
        [p.handle, p.id, p.optionId, c.id, c.from, c.to].map(csvCell).join(','),
      ),
    ),
  ].join('\n');
  writeFileSync(rollbackPath, rollback + '\n');
  console.log(`\nWrote ${rollbackPath.pathname.split('/').pop()}`);

  if (collisions.length) {
    writeFileSync(
      new URL('../size-fractions-collisions.txt', import.meta.url),
      collisions.join('\n') + '\n',
    );
    console.log(
      'Wrote size-fractions-collisions.txt — products where the rounded name already existed',
    );
  }

  if (!APPLY) {
    console.log('\nDry run — nothing changed. Re-run with --apply.\n');
    return;
  }

  const batch = Number.isFinite(LIMIT) ? plan.slice(0, LIMIT) : plan;
  console.log(`\nRenaming ${batch.length} products...`);

  const failures = [];
  let done = 0;
  for (const item of batch) {
    try {
      await rename(item, item.changes);
    } catch (error) {
      failures.push(`${item.handle}: ${error.message}`);
    }
    done++;
    if (done % 20 === 0 || done === batch.length) {
      process.stdout.write(
        `\r  renamed ${done}/${batch.length}  (${failures.length} failed)`,
      );
    }
  }
  process.stdout.write('\n');

  if (failures.length) {
    writeFileSync(
      new URL('../size-fractions-failures.txt', import.meta.url),
      failures.join('\n') + '\n',
    );
    console.log(
      `\n${failures.length} failed — see size-fractions-failures.txt`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `\nDone. To undo: node scripts/normalize-size-fractions.mjs --rollback=${rollbackPath.pathname.split('/').pop()}\n`,
    );
  }
}

// Only run when invoked directly, so the pure helpers above can be imported
// and tested without touching the Admin API.
export {fractionalSize, roundedName, planFor};

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main().catch((error) => {
    console.error(`\n${error.message}`);
    process.exit(1);
  });
}
