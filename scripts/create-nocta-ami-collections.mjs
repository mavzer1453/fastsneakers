/**
 * 24 Sep 2026 (owner: "add in clothing NOCTA and AMI Paris, only the apparel,
 * no sneakers"). Idempotent; dry run by default, --apply to write.
 *
 *  - Tags the AMI Paris apparel (titles starting "Ami ") with `brand:ami-paris`
 *    — they had no brand tag at all. The two "Aminé" New Balance pairs that a
 *    loose "ami" search also finds are left alone.
 *  - Smart collection `nocta`  : tag collab:nocta AND product type != sneakers
 *  - Smart collection `ami-paris`: tag brand:ami-paris AND product type != sneakers
 *  - Publishes both to every sales channel (Hydrogen storefront included).
 *
 * Rollback: delete the two collections; remove the brand:ami-paris tag.
 */
import {readFileSync} from 'node:fs';
import {createAdminClient} from './lib/admin.mjs';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  if (!line.includes('=') || line.trimStart().startsWith('#')) continue;
  const i = line.indexOf('=');
  const key = line.slice(0, i).trim();
  const value = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  if (value && !process.env[key]) process.env[key] = value;
}
const SHOP = (process.env.SHOPIFY_SHOP || process.env.PUBLIC_STORE_DOMAIN || '')
  .trim()
  .replace(/\.myshopify\.com$/, '');
const APPLY = process.argv.includes('--apply');
const {gql} = createAdminClient({
  shop: SHOP,
  clientId: process.env.SHOPIFY_CLIENT_ID,
  clientSecret: process.env.SHOPIFY_CLIENT_SECRET,
  apiVersion: '2025-07',
});

const NOT_SNEAKERS = {column: 'TYPE', relation: 'NOT_EQUALS', condition: 'sneakers'};
const COLLECTIONS = [
  {
    handle: 'nocta',
    title: 'NOCTA',
    descriptionHtml:
      '<p>Nike x NOCTA apparel — puffer jackets, fleece hoodies, tees and track pants from Drake’s line with Nike.</p>',
    rules: [{column: 'TAG', relation: 'EQUALS', condition: 'collab:nocta'}, NOT_SNEAKERS],
  },
  {
    handle: 'ami-paris',
    title: 'AMI Paris',
    descriptionHtml:
      '<p>AMI Paris apparel — Ami de Coeur zip hoodies, tracksuits and shorts.</p>',
    rules: [{column: 'TAG', relation: 'EQUALS', condition: 'brand:ami-paris'}, NOT_SNEAKERS],
  },
];

// 1. AMI tags
const ami = await gql(`{ products(first: 50, query: "title:Ami*") { nodes { id title productType tags } } }`);
const amiTargets = ami.products.nodes.filter(
  (p) => /^ami\s/i.test(p.title) && !/sneaker/i.test(p.productType) && !p.tags.includes('brand:ami-paris'),
);
console.log(`AMI products to tag: ${amiTargets.length}`);
for (const p of amiTargets) {
  console.log('  ', p.title);
  if (APPLY) {
    const r = await gql(`mutation($id: ID!) { tagsAdd(id: $id, tags: ["brand:ami-paris"]) { userErrors { message } } }`, {id: p.id});
    if (r.tagsAdd.userErrors.length) console.log('    FAILED', r.tagsAdd.userErrors[0].message);
  }
}

// 2. collections
const pubs = (await gql(`{ publications(first: 25) { nodes { id name } } }`)).publications.nodes;
for (const c of COLLECTIONS) {
  const existing = await gql(`query($h: String!) { collectionByHandle(handle: $h) { id title } }`, {h: c.handle});
  let id = existing.collectionByHandle?.id;
  console.log(`${c.handle}: ${id ? 'exists' : 'to create'}`);
  if (!APPLY) continue;
  if (!id) {
    const r = await gql(
      `mutation($input: CollectionInput!) { collectionCreate(input: $input) { collection { id handle } userErrors { field message } } }`,
      {input: {handle: c.handle, title: c.title, descriptionHtml: c.descriptionHtml, sortOrder: 'BEST_SELLING',
        ruleSet: {appliedDisjunctively: false, rules: c.rules}}},
    );
    if (r.collectionCreate.userErrors.length) { console.log('  FAILED', JSON.stringify(r.collectionCreate.userErrors)); continue; }
    id = r.collectionCreate.collection.id;
    console.log(`  created ${r.collectionCreate.collection.handle}`);
  }
  const p = await gql(
    `mutation($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { message } } }`,
    {id, input: pubs.map((pub) => ({publicationId: pub.id}))},
  );
  console.log(`  published to ${pubs.length} channels`, p.publishablePublish.userErrors.map((e) => e.message).join('; '));
}
