#!/usr/bin/env node
/**
 * Turn the Fear of God Essentials sets into native Shopify bundles.
 *
 * A "Full set" is a hoodie + a jogger/long pants, a "Summer set" is a T-shirt
 * + shorts. On Vespera these were native bundles; the product CSV cannot carry
 * bundle components, so after an import every set is a plain product again.
 * This script finds the two component products for every set (same colourway,
 * matching by title), maps each set variant to the right component sizes
 * (and colour, for multi-colour sets) and attaches them with
 * `productVariantRelationshipBulkUpdate`. The set keeps its own title, photos,
 * handle and price; Shopify then deducts stock from the hoodie/jogger or
 * tee/shorts and shows both pieces on the order for fulfilment.
 *
 * Run it AFTER the product CSV import (an import that overwrites a set would
 * replace its variants and drop the components).
 *
 * Usage (PowerShell — set the env vars first, like the other scripts):
 *   $env:SHOPIFY_SHOP="fqppy1-4a"            # or fqppy1-4a.myshopify.com
 *   $env:SHOPIFY_CLIENT_ID="..."; $env:SHOPIFY_CLIENT_SECRET="..."
 *   #   (or $env:SHOPIFY_ADMIN_TOKEN="shpat_..." instead of the two above)
 *
 *   node scripts/bundle-essentials-sets.mjs              # dry run -> bundle-essentials-plan.csv
 *   node scripts/bundle-essentials-sets.mjs --apply      # create the bundles
 *   node scripts/bundle-essentials-sets.mjs --only fear-of-god-essentials-seal-summer-set
 *   node scripts/bundle-essentials-sets.mjs --rollback bundle-essentials-rollback-<time>.json
 *
 * Needs `read_products` + `write_products`. Bundles made by an app can only be
 * changed by that same app afterwards — always run this script with the same
 * custom app (SHOPIFY_CLIENT_ID) so a re-run or rollback keeps working.
 * Set variants that are already bundled are skipped, so re-running is safe.
 */

import {writeFileSync, readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

// --------------------------------------------------------------- matching ---

const COLOR_OPTION = /colou?r|kleur/i;

/** Which half of a set a product is, from its title. */
export function roleOf(title) {
  const t = title.toLowerCase();
  if (/\bset\b|tracksuit|outfit/.test(t)) return null;
  if (/hoodie|sweater|crewneck|sweatshirt/.test(t)) return 'hoodie';
  if (/t-?shirt|t-hirt|\btee\b/.test(t)) return 'tee';
  if (/shorts?\b|korte broek|short pants/.test(t)) return 'shorts';
  if (/lange broek|long pants|sweatpants|pants|joggers?\b/.test(t)) return 'pants';
  return null;
}

export function isSet(title) {
  return /\bset\b/i.test(title) && /essentials/i.test(title);
}

/** Summer set = tee + shorts; every other set = hoodie + pants. */
export function setRoles(title) {
  return /summer/i.test(title) ? ['tee', 'shorts'] : ['hoodie', 'pants'];
}

const STRIP_WORDS = [
  'fear of god', 'essentials', 'full set', 'summer set', 'set', 'kids',
  'hoodie', 'sweater', 'crewneck', 'sweatshirt', 't-shirt', 't-hirt',
  'tshirt', 'tee', 'korte broek', 'lange broek', 'long pants',
  'short pants', 'sweatpants', 'joggers', 'jogger', 'shorts', 'short',
  'pants', '-',
];

/** Colourway key: the title minus brand and garment words. */
export function colourKey(title) {
  let t = ` ${title.toLowerCase().replace(/[()]/g, ' ')} `;
  for (const word of STRIP_WORDS) {
    t = t.split(` ${word} `).join(' ');
  }
  return t.replace(/\s+/g, ' ').trim();
}

/** Same key without the season code (FW24, SS25…). */
export function looseKey(key) {
  return key.replace(/\b(fw|ss)\d{2}\b/g, '').replace(/\s+/g, ' ').trim();
}

export function normSize(value) {
  return String(value)
    .toUpperCase()
    .replace(/\(.*?\)/g, '')
    .replace(/PRE-?ORDER/g, '')
    .replace(/\b2XL\b/, 'XXL')
    .replace(/\s+/g, '')
    .trim();
}

export function normColor(value) {
  return String(value)
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/gray/g, 'grey')
    .replace(/\s+/g, ' ')
    .trim();
}

function sizeOptionNames(product) {
  return product.options.map((o) => o.name).filter((n) => !COLOR_OPTION.test(n));
}

function colorOptionName(product) {
  return product.options.map((o) => o.name).find((n) => COLOR_OPTION.test(n));
}

/** For a set: which option is the top size and which the bottom size. */
export function setSizeOptions(product) {
  const names = sizeOptionNames(product);
  if (names.length === 0) return null;
  if (names.length === 1) return {top: names[0], bottom: names[0]};
  const bottomRe = /short|broek|pant|jogger|bottom/i;
  const bottom = names.find((n) => bottomRe.test(n)) ?? names[1];
  const top = names.find((n) => n !== bottom) ?? names[0];
  return {top, bottom};
}

function optionValue(variant, name) {
  return variant.selectedOptions.find((o) => o.name === name)?.value ?? null;
}

/** The component variant for one size (and colour, if the set has colours). */
export function findComponentVariant(component, size, color) {
  const sizeName = sizeOptionNames(component)[0];
  const colorName = colorOptionName(component);
  return (
    component.variants.find((v) => {
      const vSize = sizeName ? optionValue(v, sizeName) : v.title;
      if (normSize(vSize) !== normSize(size)) return false;
      if (color && colorName) {
        return normColor(optionValue(v, colorName)) === normColor(color);
      }
      return true;
    }) ?? null
  );
}

/** A component in several colours needs a colour from the set to choose. */
function colourUnclear(component, color) {
  const colorName = colorOptionName(component);
  if (!colorName || color) return false;
  const colours = new Set(component.variants.map((v) => normColor(optionValue(v, colorName))));
  return colours.size > 1;
}

/** Pick the component products for every set in `products`. */
export function matchSets(products) {
  const byRole = {hoodie: [], tee: [], shorts: [], pants: []};
  for (const p of products) {
    const role = roleOf(p.title);
    if (role) byRole[role].push(p);
  }
  const rank = (p) =>
    (p.status === 'ACTIVE' ? 1000 : 0) + (p.variants?.length ?? 0);

  /** Returns {product, loose} or null. Kids sets only take kids pieces. */
  function pick(role, set) {
    const key = colourKey(set.title);
    if (!key) return null; // "Essentials Hoodie - Set": colourway unknown
    const kids = /kids/i.test(set.title);
    const candidates = byRole[role].filter((p) => /kids/i.test(p.title) === kids);
    const exact = candidates.filter((p) => colourKey(p.title) === key);
    const loose = candidates.filter(
      (p) => looseKey(key) && looseKey(colourKey(p.title)) === looseKey(key),
    );
    const pool = exact.length > 0 ? exact : loose;
    const product = pool.sort((a, b) => rank(b) - rank(a))[0] ?? null;
    return product ? {product, loose: exact.length === 0} : null;
  }

  const plans = [];
  for (const set of products.filter((p) => isSet(p.title))) {
    const [topRole, bottomRole] = setRoles(set.title);
    const topPick = pick(topRole, set);
    const bottomPick = pick(bottomRole, set);
    const top = topPick?.product ?? null;
    const bottom = bottomPick?.product ?? null;
    const match = topPick?.loose || bottomPick?.loose ? 'loose (season differs)' : 'exact';
    const sizes = setSizeOptions(set);
    const colorName = colorOptionName(set);
    const rows = [];
    for (const v of set.variants) {
      const row = {
        set: set.handle,
        setVariantId: v.id,
        setVariant: v.title,
        top: top?.handle ?? '',
        topVariantId: '',
        topVariant: '',
        bottom: bottom?.handle ?? '',
        bottomVariantId: '',
        bottomVariant: '',
        match,
        status: '',
      };
      if (v.alreadyBundled) row.status = 'already bundled';
      else if (!top) row.status = `no ${topRole} found for "${colourKey(set.title)}"`;
      else if (!bottom) row.status = `no ${bottomRole} found for "${colourKey(set.title)}"`;
      else if (!sizes) row.status = 'set has no size option';
      else if (
        colourUnclear(top, colorName ? optionValue(v, colorName) : null) ||
        colourUnclear(bottom, colorName ? optionValue(v, colorName) : null)
      )
        row.status = 'component has several colours, set has none';
      else {
        const color = colorName ? optionValue(v, colorName) : null;
        const tv = findComponentVariant(top, optionValue(v, sizes.top), color);
        const bv = findComponentVariant(bottom, optionValue(v, sizes.bottom), color);
        if (tv) Object.assign(row, {topVariantId: tv.id, topVariant: tv.title});
        if (bv) Object.assign(row, {bottomVariantId: bv.id, bottomVariant: bv.title});
        row.status = tv && bv ? 'ok' : `size missing: ${tv ? '' : topRole} ${bv ? '' : bottomRole}`.trim();
      }
      rows.push(row);
    }
    plans.push({set, top, bottom, rows});
  }
  return plans;
}

// -------------------------------------------------------------- admin api ---

async function makeClient() {
  const shopRaw = process.env.SHOPIFY_SHOP ?? '';
  const shop = shopRaw.replace(/^https?:\/\//, '').replace(/\.myshopify\.com.*$/, '');
  if (!shop) throw new Error('Set SHOPIFY_SHOP (e.g. fqppy1-4a).');
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  if (token) {
    const endpoint = `https://${shop}.myshopify.com/admin/api/2025-07/graphql.json`;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    return {
      async gql(query, variables = {}, attempt = 0) {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {'Content-Type': 'application/json', 'X-Shopify-Access-Token': token},
          body: JSON.stringify({query, variables}),
        });
        const json = await res.json();
        if (json.errors) {
          if (json.errors.some((e) => e.extensions?.code === 'THROTTLED') && attempt < 8) {
            await sleep(2000 * (attempt + 1));
            return this.gql(query, variables, attempt + 1);
          }
          throw new Error(`GraphQL: ${JSON.stringify(json.errors).slice(0, 300)}`);
        }
        return json.data;
      },
    };
  }
  const {createAdminClient} = await import('./lib/admin.mjs');
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Set SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET (or SHOPIFY_ADMIN_TOKEN).');
  }
  return createAdminClient({shop, clientId, clientSecret});
}

const PRODUCTS_QUERY = `#graphql
  query EssentialsProducts($after: String) {
    products(first: 4, after: $after, query: "title:*essentials*") {
      pageInfo { hasNextPage endCursor }
      nodes {
        id handle title status
        options { name }
        variants(first: 100) {
          nodes {
            id title
            selectedOptions { name value }
            productVariantComponents(first: 1) { nodes { id } }
          }
        }
      }
    }
  }
`;

async function loadProducts(client) {
  const products = [];
  let after = null;
  do {
    const data = await client.gql(PRODUCTS_QUERY, {after});
    for (const p of data.products.nodes) {
      products.push({
        ...p,
        variants: p.variants.nodes.map((v) => ({
          ...v,
          alreadyBundled: v.productVariantComponents.nodes.length > 0,
        })),
      });
    }
    after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
    process.stdout.write(`\rLoaded ${products.length} Essentials products…`);
  } while (after);
  process.stdout.write('\n');
  return products;
}

const BUNDLE_MUTATION = `#graphql
  mutation Bundle($input: [ProductVariantRelationshipUpdateInput!]!) {
    productVariantRelationshipBulkUpdate(input: $input) {
      parentProductVariants { id }
      userErrors { code field message }
    }
  }
`;

function toCsv(rows) {
  const cols = Object.keys(rows[0] ?? {set: ''});
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
  const rollbackFile = args.includes('--rollback') ? args[args.indexOf('--rollback') + 1] : null;
  const client = await makeClient();

  if (rollbackFile) {
    const ids = JSON.parse(readFileSync(rollbackFile, 'utf8')).bundledVariantIds;
    for (let i = 0; i < ids.length; i += 20) {
      const input = ids.slice(i, i + 20).map((id) => ({
        parentProductVariantId: id,
        removeAllProductVariantRelationships: true,
      }));
      const data = await client.gql(BUNDLE_MUTATION, {input});
      const errors = data.productVariantRelationshipBulkUpdate.userErrors;
      if (errors.length) console.error(errors);
      console.log(`Un-bundled ${Math.min(i + 20, ids.length)}/${ids.length}`);
    }
    return;
  }

  const products = await loadProducts(client);
  let plans = matchSets(products);
  if (only) plans = plans.filter((p) => p.set.handle === only);
  const rows = plans.flatMap((p) => p.rows);
  writeFileSync('bundle-essentials-plan.csv', toCsv(rows));

  const todo = rows.filter((r) => r.status === 'ok');
  console.log(`\n${plans.length} sets, ${rows.length} set variants:`);
  for (const p of plans) {
    const ok = p.rows.filter((r) => r.status === 'ok').length;
    const done = p.rows.filter((r) => r.status === 'already bundled').length;
    console.log(
      `  ${ok === p.rows.length || ok + done === p.rows.length ? '✓' : ok ? '~' : '✗'} ${p.set.title}` +
        `  →  ${p.top?.title ?? '—'}  +  ${p.bottom?.title ?? '—'}` +
        `  (${ok} to bundle${done ? `, ${done} done` : ''}, ${p.rows.length - ok - done} skipped)`,
    );
  }
  console.log(`\nPlan written to bundle-essentials-plan.csv (${todo.length} variants to bundle).`);
  if (!apply) {
    console.log('Dry run — nothing changed. Re-run with --apply to create the bundles.');
    return;
  }

  const done = [];
  for (let i = 0; i < todo.length; i += 20) {
    const batch = todo.slice(i, i + 20);
    const input = batch.map((r) => ({
      parentProductVariantId: r.setVariantId,
      productVariantRelationshipsToCreate: [
        {id: r.topVariantId, quantity: 1},
        {id: r.bottomVariantId, quantity: 1},
      ],
    }));
    const data = await client.gql(BUNDLE_MUTATION, {input});
    const result = data.productVariantRelationshipBulkUpdate;
    if (result.userErrors.length) console.error(result.userErrors);
    done.push(...(result.parentProductVariants ?? []).map((v) => v.id));
    console.log(`Bundled ${done.length}/${todo.length}`);
  }
  const file = `bundle-essentials-rollback-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(file, JSON.stringify({bundledVariantIds: done}, null, 2));
  console.log(`Done. Rollback file: ${file} (commit it).`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
