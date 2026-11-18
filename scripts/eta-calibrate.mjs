#!/usr/bin/env node
/**
 * Learn the "Estimated arrival" windows for /pages/track-order from OUR OWN
 * delivered orders: every shipped order → BuckyDrop scan history → days from
 * order / dispatch / flight-landed to delivery, grouped by destination zone.
 *
 *   node scripts/eta-calibrate.mjs            # prints a table + JSON summary
 *   node scripts/eta-calibrate.mjs --dump     # also writes eta-calibration-<date>.json
 *
 * Read-only. Needs SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET in .env (same
 * app the other scripts use; needs read_orders + read_all_orders).
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {createAdminClient} from './lib/admin.mjs';

for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const SHOP = (process.env.SHOPIFY_SHOP || process.env.PUBLIC_STORE_DOMAIN).replace(/\.myshopify\.com$/, '');
const {gql} = createAdminClient({shop: SHOP, clientId: process.env.SHOPIFY_CLIENT_ID, clientSecret: process.env.SHOPIFY_CLIENT_SECRET, apiVersion: '2025-07'});

const ZONES = {
  core: 'NL BE DE FR AT LU', uk: 'GB IE', na: 'US CA MX', oce: 'AU NZ',
  eu2: 'CH NO IT ES PT GR HR SE FI DK PL CZ SK HU RO BG SI LT LV EE CY MT IS',
  far: 'JP KR SG HK AE SA QA KW IL TR ZA BR AR CL IN',
};
const zoneOf = (cc) => Object.keys(ZONES).find((k) => (' ' + ZONES[k] + ' ').includes(' ' + cc + ' ')) || 'core';

const LANDED_RE = /flight (has )?(landed|arrived)|truck dispatch|awaits scanning|customs clearance completed|handed over to the local carrier|arrived at gofo regional hub|parcel received by uniuni|arrived at the parcel center|processed at the sorting center|processed in the parcel center|transiting through our logistics|left the border point|arrived in the region of recipient|arrived in your region|arrived at destination|arrived in destination country|import clearance|arrival at destination|arrived at local/i;
const DEPART_RE = /flight (has )?(taken off|departed)|departed from (origin|the) (international )?airport|export/i;
const DELIVERED_RE = /\bdelivered\b|签收|妥投|已送达|collected by|recipient collected|signed for|picked up by (the )?(recipient|customer)|entregado|consegnato|zugestellt|livr[ée]|bezorgd|afgeleverd|doru[čc]en|dor[ęe]czon|levererad|leveret|toimitettu/i;
const NOT_DELIVERED_RE = /not delivered|undelivered|attempt|unsuccessful|will be delivered|be delivered|delivery (is )?expected|out for delivery/i;

const parseTime = (s) => { // BuckyDrop "YYYY-MM-DD HH:mm" (China time, +08:00)
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 8, +m[5]) : null;
};
const day = (ms) => Math.floor(ms / 864e5);

async function tracking(code) {
  const r = await fetch('https://www.buckydrop.com/api/buckydrop/portal/logistics/tracking', {
    method: 'POST', headers: {'content-type': 'application/json;charset=UTF-8', 'user-agent': 'Mozilla/5.0'},
    body: JSON.stringify({packageCode: code}), signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!r || !r.ok) return null;
  const j = await r.json().catch(() => null);
  return j && j.data && j.data.traceCode ? j.data : null;
}

const Q = `query($after:String){ orders(first:50, after:$after, sortKey:CREATED_AT, reverse:true, query:"fulfillment_status:shipped") {
  pageInfo{hasNextPage endCursor}
  nodes{ name createdAt test cancelledAt shippingAddress{countryCodeV2} fulfillments(first:5){ createdAt status trackingInfo{number} } } } }`;

// `--orders file.json` = use an exported order list instead of the Admin API
// (handy while the app has no read_orders scope yet).
const orders = [];
const fileArg = process.argv.indexOf('--orders');
if (fileArg > -1) {
  orders.push(...JSON.parse(readFileSync(process.argv[fileArg + 1], 'utf8')));
} else {
  let after = null;
  do {
    const d = await gql(Q, {after});
    orders.push(...d.orders.nodes);
    after = d.orders.pageInfo.hasNextPage ? d.orders.pageInfo.endCursor : null;
  } while (after);
}
console.log(`${orders.length} shipped orders`);

const rows = [];
for (const o of orders) {
  if (o.test || o.cancelledAt) continue;
  const cc = o.shippingAddress?.countryCodeV2 || '';
  for (const f of o.fulfillments) {
    if (f.status !== 'SUCCESS') continue;
    for (const t of f.trackingInfo) {
      const data = await tracking(t.number);
      const nodes = [...(data?.originTraceInfo?.traceNodes || []), ...(data?.destinationTraceInfo?.traceNodes || [])]
        .map((n) => ({at: parseTime(n.recordTime), text: String(n.description || '')})).filter((n) => n.at).sort((a, b) => a.at - b.at);
      const last = nodes[nodes.length - 1];
      const delivered = last && DELIVERED_RE.test(last.text) && !NOT_DELIVERED_RE.test(last.text) ? last.at : null;
      let departed = 0; for (const n of nodes) if (DEPART_RE.test(n.text)) departed = Math.max(departed, n.at);
      const landed = nodes.find((n) => n.at >= departed && LANDED_RE.test(n.text))?.at || null;
      const first = nodes[0]?.at || null;
      const landedText = nodes.find((n) => n.at >= departed && LANDED_RE.test(n.text))?.text || '';
      rows.push({landedText, order: o.name, cc, zone: zoneOf(cc), placed: Date.parse(o.createdAt), shipped: Date.parse(f.createdAt), firstScan: first, departed: departed || null, landed, delivered, scans: nodes.length, lastText: last?.text || ''});
      process.stdout.write(`${o.name} ${cc} ${nodes.length} scans ${delivered ? 'DELIVERED' : (last ? last.text.slice(0, 50) : 'no scans')}\n`);
    }
  }
}

const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const summary = {};
for (const z of Object.keys(ZONES)) {
  const del = rows.filter((r) => r.zone === z && r.delivered);
  const stat = (f) => { const a = del.map(f).filter((x) => x != null); return {n: a.length, p25: q(a, 0.25), med: q(a, 0.5), p75: q(a, 0.75), min: q(a, 0), max: q(a, 1)}; };
  summary[z] = {
    shipped: rows.filter((r) => r.zone === z).length, delivered: del.length,
    placedToDoor: stat((r) => day(r.delivered) - day(r.placed)),
    shippedToDoor: stat((r) => day(r.delivered) - day(r.shipped)),
    landedToDoor: stat((r) => (r.landed ? day(r.delivered) - day(r.landed) : null)),
  };
}
console.log('\nzone     shipped delivered | placed→door (p25/med/p75) | shipped→door | landed→door');
for (const [z, s] of Object.entries(summary)) {
  const f = (x) => (x.n ? `${x.p25}/${x.med}/${x.p75} (n=${x.n})` : '—');
  console.log(`${z.padEnd(8)} ${String(s.shipped).padStart(7)} ${String(s.delivered).padStart(9)} | ${f(s.placedToDoor).padEnd(22)} | ${f(s.shippedToDoor).padEnd(18)} | ${f(s.landedToDoor)}`);
}
if (process.argv.includes('--dump')) {
  const file = `eta-calibration-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(file, JSON.stringify({summary, rows}, null, 2));
  console.log(`wrote ${file}`);
}
