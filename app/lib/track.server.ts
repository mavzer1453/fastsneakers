/**
 * Order tracking backend for /pages/track-order.
 *
 * Same rules as the page this one is modelled on (mera-fashion.com/pages/track):
 *
 *  - The order comes from the Shopify Admin API (client-credentials token the
 *    live-activity popup already uses). Needs `read_orders`, `read_all_orders`
 *    (orders older than 60 days), `read_fulfillments`, `read_customers` and the
 *    protected-customer-data approval on that app — without them lookups
 *    answer the calm "taking a little break" message, never a raw error.
 *  - The parcel's scan history comes from BuckyDrop's logistics feed (the
 *    same data its 18tracking page shows), keyed by the tracking number on
 *    the Shopify fulfilment.
 *  - Every scan is rewritten before it leaves this module. The customer never
 *    sees China, Chinese cities or characters, BuckyDrop, line-haul carriers,
 *    flights, airports, customs, warehouses, tracking numbers or carrier
 *    links. If a line cannot be rewritten into a neutral phrase it is dropped.
 *  - Times are epoch milliseconds (UTC). Timeline is newest first.
 *
 * On top of that: an "Estimated arrival" window (5 delivery days, Sundays
 * skipped) learned from OUR OWN delivered orders — see ETA_ZONES.
 */

const ADMIN_API_VERSION = '2025-07';
const BUCKYDROP_TRACKING =
  'https://www.buckydrop.com/api/buckydrop/portal/logistics/tracking';

/** Processing window we promise (business days) — SHOP.shipsWithin says 1–3. */
const PROCESSING_BUSINESS_DAYS = 3;
/** Delivery window we promise after dispatch (business days) — policy says 5–15. */
const DELIVERY_BUSINESS_DAYS = 15;

const TRACKING_TIMEOUT_MS = 8_000;
const TRACKING_CACHE_MS = 15 * 60_000;
const TRACKING_KEEP_MS = 7 * 24 * 60 * 60_000;

const DAY = 864e5;

// ----------------------------------------------------------------- types ---

export interface TrackItem {
  title: string;
  variant: string | null;
  qty: number;
  image: string | null;
}

export interface TrackStep {
  key: 'placed' | 'packed' | 'shipped' | 'out' | 'delivered';
  title: string;
  done: boolean;
  current: boolean;
  at: number | null;
}

export interface TrackEta {
  /** The 5 delivery days (UTC midnight, ms), Sundays skipped. */
  days: number[];
  /** Most likely day (one of `days`). */
  peak: number;
  /** What the window was based on. */
  basis: 'landed' | 'shipped' | 'placed' | 'fallback';
}

export interface TrackView {
  stage: 0 | 1 | 2 | 3 | 4;
  tone: 'calm' | 'good' | 'delay' | 'action' | 'alert';
  delayed: boolean;
  special: 'pickup' | null;
  headline: string;
  message: string;
  steps: TrackStep[];
  localCarrier: string | null;
  /** The latest event is a failed delivery attempt (not delivered yet). */
  attempt: boolean;
  details: Array<{text: string; at: number}>;
  eta: TrackEta | null;
}

export interface TrackParcel {
  label: string | null;
  liveUpdatesPaused: boolean;
  items: TrackItem[];
  view: TrackView;
}

export interface TrackResult {
  order: string;
  firstName: string | null;
  placedAt: number | null;
  country: string | null;
  notice?: {tone: 'alert'; headline: string; message: string};
  parcels: TrackParcel[];
  waiting?: {headline: string; message: string; items: TrackItem[]};
}

export class TrackError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const MESSAGES = {
  notFound:
    'We could not find an order with these details. Please check your order number and use the email address you ordered with.',
  numberNotFound:
    'We could not find this tracking number yet. Please try again later, or look up your order with your order number and email.',
  rateLimited: 'Too many attempts. Please wait a few minutes and try again.',
  unavailable:
    'Tracking is taking a little break. Please try again in a few minutes.',
};

// ------------------------------------------------------------ admin api ---

let tokenCache: {token: string; expiresAt: number} | null = null;

async function adminToken(env: Env): Promise<string | null> {
  const domain = env.PUBLIC_STORE_DOMAIN;
  const clientId = env.SHOPIFY_CLIENT_ID;
  const clientSecret = env.SHOPIFY_CLIENT_SECRET;
  if (!domain || !clientId || !clientSecret) return null;
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }
  const response = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!body.access_token) return null;
  tokenCache = {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  };
  return tokenCache.token;
}

interface AdminLineItem {
  title: string;
  variantTitle: string | null;
  quantity: number;
  unfulfilledQuantity: number;
  image: {url: string} | null;
}

export interface AdminOrder {
  id?: string;
  tags?: string[];
  sourceName?: string | null;
  name: string;
  email: string | null;
  createdAt: string;
  cancelledAt: string | null;
  displayFinancialStatus: string | null;
  customer: {firstName: string | null; email: string | null} | null;
  shippingAddress: {firstName: string | null; countryCodeV2: string | null} | null;
  lineItems: {nodes: AdminLineItem[]};
  fulfillments: Array<{
    createdAt: string;
    status: string;
    trackingInfo: Array<{number: string | null; company: string | null}>;
    fulfillmentLineItems: {
      nodes: Array<{
        quantity: number;
        lineItem: {
          title: string;
          variantTitle: string | null;
          image: {url: string} | null;
        };
      }>;
    };
  }>;
}

// No `#graphql` tag: Admin API document, codegen validates tagged ones
// against the Storefront schema.
/** Order fields the tracking view needs — shared with the chargeback-mail job. */
export const ORDER_FIELDS = `
  id
  name
  email
  createdAt
  cancelledAt
  tags
  sourceName
  displayFinancialStatus
  customer { firstName email }
  shippingAddress { firstName countryCodeV2 }
  lineItems(first: 50) {
    nodes { title variantTitle quantity unfulfilledQuantity image { url } }
  }
  fulfillments(first: 10) {
    createdAt
    status
    trackingInfo { number company }
    fulfillmentLineItems(first: 50) {
      nodes { quantity lineItem { title variantTitle image { url } } }
    }
  }
`;

const ORDER_QUERY = `
  query TrackOrder($query: String!) {
    orders(first: 5, query: $query) {
      nodes { ${ORDER_FIELDS} }
    }
  }
`;

export async function adminQuery<T>(
  env: Env,
  query: string,
  variables: Record<string, unknown>,
  attempt = 0,
): Promise<T> {
  const token = await adminToken(env);
  if (!token) throw new TrackError(502, 'unavailable', MESSAGES.unavailable);
  const response = await fetch(
    `https://${env.PUBLIC_STORE_DOMAIN}/admin/api/${ADMIN_API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({query, variables}),
    },
  );
  const json = (await response.json().catch(() => null)) as {
    data?: T;
    errors?: Array<{message?: string; extensions?: {code?: string}}>;
  } | null;
  if (!response.ok || !json || json.errors) {
    const throttled = json?.errors?.some(
      (e) => e.extensions?.code === 'THROTTLED',
    );
    if ((throttled || response.status >= 500) && attempt < 1) {
      await new Promise((r) => setTimeout(r, 1000));
      return adminQuery<T>(env, query, variables, attempt + 1);
    }
    console.log(
      'track: admin query failed',
      response.status,
      json?.errors?.[0]?.extensions?.code ?? '',
    );
    throw new TrackError(502, 'unavailable', MESSAGES.unavailable);
  }
  return json.data as T;
}

// ------------------------------------------------------------ buckydrop ---

interface RawNode {
  at: number;
  text: string;
  pos: string;
  /** true for nodes from destinationTraceInfo (the local carrier's leg). */
  dest: boolean;
}

interface RawTracking {
  nodes: RawNode[];
  destinationCountry: string | null;
  carrierNames: string[];
}

const trackingCache = new Map<string, {at: number; data: RawTracking | null}>();

/** BuckyDrop times are "YYYY-MM-DD HH:mm" in China time (UTC+8). */
function parseBuckyTime(value: unknown): number | null {
  const m = String(value ?? '').match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/,
  );
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 8, +m[5]);
}

async function fetchTrackingLive(code: string): Promise<RawTracking | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRACKING_TIMEOUT_MS);
  try {
    const response = await fetch(BUCKYDROP_TRACKING, {
      method: 'POST',
      headers: {
        'content-type': 'application/json;charset=UTF-8',
        'user-agent': 'Mozilla/5.0',
      },
      body: JSON.stringify({packageCode: code}),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const json = (await response.json()) as {
      success?: boolean;
      data?: {
        traceCode?: string;
        destinationCountry?: string;
        originTraceInfo?: {
          carrierName?: string;
          traceNodes?: Array<{recordTime?: string; description?: string; pos?: string}>;
        };
        destinationTraceInfo?: {
          carrierName?: string;
          traceNodes?: Array<{recordTime?: string; description?: string; pos?: string}>;
        };
      };
    };
    const data = json?.data;
    if (!json?.success || !data) return null;
    if (!data.traceCode) {
      // `data: {}` = BuckyDrop knows nothing yet. Not an error.
      return {nodes: [], destinationCountry: null, carrierNames: []};
    }
    const nodes: RawNode[] = [];
    for (const n of data.originTraceInfo?.traceNodes ?? []) {
      const at = parseBuckyTime(n.recordTime);
      if (at) nodes.push({at, text: String(n.description ?? ''), pos: String(n.pos ?? ''), dest: false});
    }
    for (const n of data.destinationTraceInfo?.traceNodes ?? []) {
      const at = parseBuckyTime(n.recordTime);
      if (at) nodes.push({at, text: String(n.description ?? ''), pos: String(n.pos ?? ''), dest: true});
    }
    nodes.sort((a, b) => a.at - b.at);
    return {
      nodes,
      destinationCountry: data.destinationCountry ?? null,
      carrierNames: [
        data.originTraceInfo?.carrierName ?? '',
        data.destinationTraceInfo?.carrierName ?? '',
      ].filter(Boolean),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cached for 15 minutes; the last good answer is kept for 7 days so a
 * BuckyDrop hiccup shows the previous state with `paused: true` instead of
 * an error.
 */
async function fetchTracking(
  code: string,
): Promise<{data: RawTracking | null; paused: boolean}> {
  const hit = trackingCache.get(code);
  const now = Date.now();
  if (hit && hit.data && now - hit.at < TRACKING_CACHE_MS) {
    return {data: hit.data, paused: false};
  }
  const live = await fetchTrackingLive(code);
  if (live) {
    trackingCache.set(code, {at: now, data: live});
    return {data: live, paused: false};
  }
  if (hit && hit.data && now - hit.at < TRACKING_KEEP_MS) {
    return {data: hit.data, paused: true};
  }
  return {data: null, paused: true};
}

// ------------------------------------------------------------ sanitiser ---

const CJK = /[㐀-鿿豈-﫿]/;

/** Anything that mentions where the parcel really comes from → dropped. */
const DROP_RE =
  /china|chinese|shenzhen|guangzhou|dongguan|yiwu|shanghai|hong ?kong|putian|fujian|quanzhou|xiamen|hangzhou|ningbo|beijing|fuzhou|zhejiang|guangdong|jiangsu|buckydrop|bucky|cainiao|yanwen|yunexpress|yuntrack|4px|wanb|jindouyun|shilianxin|origin (facility|warehouse|international)|carrier warehouse|warehouse|purchas|procur|inbound|quality|\bqc\b|weigh|estimated|expected|forecast|electronic|label created|shipping label|information received|instruction data|panel removal|domestic|export|declaration|country of origin|origin (?:customs|clearance)|mainland|\bcn\b|\b5180\d\d\b|17track/i;

const DELIVERED_RE =
  /\bdelivered\b|recipient collected|collected by|signed for|picked up by (the )?(recipient|customer)|entregado|consegnato|zugestellt|livr[ée]|bezorgd|afgeleverd|doru[čc]en|dor[ęe]czon|levererad|leveret|toimitettu|delivery (was )?(completed|successful)/i;
const NOT_DELIVERED_RE =
  /not delivered|undelivered|unsuccessful|attempt|could not|will be delivered|be delivered|delivery (is )?expected|out for delivery|scheduled|delivered to (the )?(carrier|airline|airport)|ready to be/i;
const PICKUP_RE =
  /pickup point|pick-?up (point|location|shop)|parcel ?shop|parcel locker|\blocker\b|packstation|post office|collection point|ready for (collection|pickup)|available for (pickup|collection)|retail point|service point|awaiting collection|afhaalpunt|punto de recogida|relais/i;
const ATTEMPT_RE =
  /delivery attempt|attempted|not (at )?home|unsuccessful|could not be delivered|absent|recipient (not|un)available|no one (was )?(home|available)/i;
const ALERT_RE =
  /return(ed|ing)? to (the )?sender|address (incorrect|unknown|incomplete|insufficient|not found)|undeliverable|refused|damaged|lost|held by/i;
const OUT_RE =
  /out for delivery|with (the )?courier|on vehicle for delivery|in delivery|being delivered|on its way to you|driver|unterwegs zur zustellung|en cours de livraison|in bezorging|in consegna|en reparto/i;
const LOCAL_SORT_RE =
  /parcel cent(er|re)|sorting cent(er|re)|sort facility|distribution cent(er|re)|delivery (depot|facility|station|office|unit|centre|center)|regional hub|local (hub|facility|depot)|processed at|arrived at (the )?(parcel|delivery|local|regional)|received in depot|depot|arrived in your region|arrived in the region|has arrived at the parcel/i;
const HANDED_RE =
  /goods have been received|received by|accepted|picked up|collected from (the )?sender|arrived at origin|shipment information|handed (over )?to (the )?(carrier|delivery)|parcel received|hand over|handover/i;
const TRANSIT_RE =
  /flight|airline|airport|air cargo|taken off|departed|depart|line.?haul|in transit|transit to next|handed over to the airline|landed|arriv|hub|export|transiting|left the|en route|linehaul|cargo/i;
const CUSTOMS_RE = /customs|clearance|clearence|import|duty|duties|border/i;
/** The parcel is in the destination country from this moment on. */
const LANDED_RE =
  /flight (has )?(landed|arrived)|航班落地|飞行到达|truck dispatch|awaits scanning|handed over to the local carrier|arrived at gofo|parcel received by uniuni|received by (australia post|royal mail|evri|dhl|postnl|bpost|usps|canada post|correos|poste italiane|colissimo|la poste|dpd|gls|hermes|yodel|parcelforce)|arrived at the parcel cent|processed in the parcel cent|arrived at destination|arrived in destination|destination (country|customs|airport)|目的地|import clearance|left the border point|arrived in the region of recipient|arrived in your region|delivery to final service provider|final service provider/i;
/** "Label created / electronic info received" type events: still stage 1. */
const LABEL_RE =
  /electronic|label|information received|instruction data|on the way to carrier warehouse|货物电子信息|^\s*$/i;
const DEPART_RE =
  /flight (has )?(taken off|departed)|departed from (the )?(origin|international)|export (customs )?clear|clearence processing completed - export|handed over to the airline/i;

/** Destination-country carriers whose name we are happy to show. */
const LOCAL_CARRIERS: Array<[RegExp, string]> = [
  [/royal mail/i, 'Royal Mail'],
  [/parcelforce/i, 'Parcelforce'],
  [/\bevri\b|hermes uk/i, 'Evri'],
  [/\byodel\b/i, 'Yodel'],
  [/\bdpd\b/i, 'DPD'],
  [/\bgls\b/i, 'GLS'],
  [/postnl|cityhub/i, 'PostNL'],
  [/bpost/i, 'bpost'],
  [/dhl paket|deutsche post|packstation|\bdhl\b/i, 'DHL'],
  [/\bhermes\b/i, 'Hermes'],
  [/colissimo/i, 'Colissimo'],
  [/chronopost/i, 'Chronopost'],
  [/la poste/i, 'La Poste'],
  [/\busps\b|united states postal/i, 'USPS'],
  [/\bgofo\b/i, 'GOFO Express'],
  [/\bups\b/i, 'UPS'],
  [/fedex/i, 'FedEx'],
  [/uniuni/i, 'UniUni'],
  [/canada post/i, 'Canada Post'],
  [/purolator/i, 'Purolator'],
  [/australia post|auspost/i, 'Australia Post'],
  [/nz post/i, 'NZ Post'],
  [/correos/i, 'Correos'],
  [/poste italiane/i, 'Poste Italiane'],
  [/swiss post|die post/i, 'Swiss Post'],
  [/\bppl\b/i, 'PPL'],
  [/posti/i, 'Posti'],
  [/postnord/i, 'PostNord'],
  [/inpost/i, 'InPost'],
  [/\bbring\b/i, 'Bring'],
  [/an post/i, 'An Post'],
  [/österreichische post|austrian post/i, 'Österreichische Post'],
];

function landedAt(nodes: RawNode[]): number | null {
  let departed = 0;
  for (const n of nodes) if (DEPART_RE.test(n.text)) departed = Math.max(departed, n.at);
  for (const n of nodes) {
    if (n.dest) return n.at;
    if (n.at >= departed && LANDED_RE.test(n.text)) return n.at;
  }
  return null;
}

/**
 * Rewrite one raw scan into a neutral English line, or null to drop it.
 * `landed` = the parcel is already in the customer's country.
 */
function rewrite(text: string, landed: boolean): string | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const low = t.toLowerCase();
  // Delivered / pickup / attempt first: a delivered line can contain a city.
  if (DELIVERED_RE.test(low) && !NOT_DELIVERED_RE.test(low)) return 'Delivered';
  if (PICKUP_RE.test(low)) return 'Ready for pickup at a nearby pickup point';
  if (ATTEMPT_RE.test(low)) {
    return 'Delivery attempt, the courier will try again or leave it at a pickup point';
  }
  if (OUT_RE.test(low)) return 'Out for delivery';
  if (ALERT_RE.test(low)) return 'There is a delivery issue, please contact us';
  if (CJK.test(t) && !landed) return null;
  if (!landed && DROP_RE.test(low)) return null;
  if (CUSTOMS_RE.test(low)) {
    return landed ? 'Being processed for delivery in your country' : null;
  }
  if (landed) {
    if (LOCAL_SORT_RE.test(low)) return 'Arrived at the local sorting centre';
    if (/arrived in your country|arrived in the destination|landed|arriv/.test(low)) {
      return 'Arrived in your country';
    }
    return 'Moving through the local delivery network';
  }
  if (HANDED_RE.test(low) && !TRANSIT_RE.test(low)) return 'Handed to our delivery partner';
  if (TRANSIT_RE.test(low)) return 'In transit to your country';
  return null;
}

function sanitize(nodes: RawNode[], landed: number | null): Array<{text: string; at: number}> {
  const out: Array<{text: string; at: number}> = [];
  for (const n of nodes) {
    const text = rewrite(n.text, landed != null && n.at >= landed);
    if (!text) continue;
    const prev = out[out.length - 1];
    if (prev && prev.text === text && n.at - prev.at < 6 * 60 * 60_000) {
      prev.at = n.at; // duplicate within 6 h → keep the newest
      continue;
    }
    out.push({text, at: n.at});
  }
  // Delivered is final: nothing after it adds anything.
  const idx = out.findIndex((d) => d.text === 'Delivered');
  const list = idx > -1 ? out.slice(0, idx + 1) : out;
  return list.reverse(); // newest first
}

// --------------------------------------------------------- business days ---

function addBusinessDays(from: number, days: number): number {
  let t = from;
  let left = days;
  while (left > 0) {
    t += DAY;
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return t;
}

function utcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// ------------------------------------------------------------------ eta ---

/**
 * Estimated-arrival windows, in DAYS from the base event, as [from, to, peak].
 *
 * Learned from our own delivered orders (scripts/eta-calibrate.mjs, run on
 * 30 Oct 2026 over 38 shipped / 25 delivered orders, Aug–Oct 2026):
 *   core  NL/BE/DE  placed→door median 16 d · dispatch→door 11 d · landed→door 4 d
 *   uk    GB        placed→door 19 d · dispatch→door 12 d · landed→door 4 d
 *   na    US/CA     placed→door 20 d · dispatch→door 13 d · landed→door 5 d
 *   eu2   ES/CZ     placed→door 21 d · dispatch→door 13 d · landed→door 7 d (2 orders)
 * Window = median ± 2 days, peak = median. Zones we have not delivered to yet
 * (oce, far) keep the numbers MeraFashion learned from its 193 deliveries.
 * Re-run the script every few months and update this table.
 */
export const ETA_ZONES: Record<
  string,
  {cc: string; placed: [number, number, number]; shipped: [number, number, number]; landed: [number, number, number]}
> = {
  core: {cc: 'NL BE DE FR AT LU', placed: [14, 18, 16], shipped: [9, 13, 11], landed: [2, 6, 4]},
  uk: {cc: 'GB IE', placed: [17, 21, 19], shipped: [10, 14, 12], landed: [2, 6, 4]},
  na: {cc: 'US CA MX', placed: [18, 22, 20], shipped: [11, 15, 13], landed: [3, 7, 5]},
  oce: {cc: 'AU NZ', placed: [20, 24, 22], shipped: [13, 17, 15], landed: [10, 14, 12]},
  eu2: {
    cc: 'CH NO IT ES PT GR HR SE FI DK PL CZ SK HU RO BG SI LT LV EE CY MT IS',
    placed: [19, 23, 21],
    shipped: [11, 15, 13],
    landed: [5, 9, 7],
  },
  far: {
    cc: 'JP KR SG HK AE SA QA KW IL TR ZA BR AR CL IN',
    placed: [20, 24, 22],
    shipped: [13, 17, 15],
    landed: [5, 9, 7],
  },
};

const COUNTRY_NAMES: Record<string, string> = {
  usa: 'US', 'united states': 'US', 'united kingdom': 'GB', uk: 'GB', england: 'GB',
  germany: 'DE', netherlands: 'NL', belgium: 'BE', france: 'FR', spain: 'ES', italy: 'IT',
  poland: 'PL', canada: 'CA', australia: 'AU', austria: 'AT', ireland: 'IE', portugal: 'PT',
  sweden: 'SE', denmark: 'DK', finland: 'FI', norway: 'NO', switzerland: 'CH',
  'czech republic': 'CZ', czechia: 'CZ', greece: 'GR', hungary: 'HU', romania: 'RO',
};

function countryCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
  return COUNTRY_NAMES[v.toLowerCase()] ?? null;
}

function zoneFor(cc: string | null) {
  if (cc) {
    for (const zone of Object.values(ETA_ZONES)) {
      if ((' ' + zone.cc + ' ').includes(' ' + cc + ' ')) return zone;
    }
  }
  return ETA_ZONES.core;
}

/**
 * The 5-day window. Always 5 delivery days wide; Sundays are skipped because
 * our local carriers (Royal Mail, PostNL, bpost, DHL, USPS, Colissimo…)
 * deliver Monday to Saturday but not on Sunday. Never a window in the past.
 */
export function buildEta(opts: {
  country: string | null;
  landedAt: number | null;
  shippedAt: number | null;
  placedAt: number | null;
  now?: number;
}): TrackEta | null {
  const zone = zoneFor(opts.country);
  const today = utcDay(opts.now ?? Date.now());
  let base: number;
  let win: [number, number, number];
  let basis: TrackEta['basis'];
  if (opts.landedAt) {
    base = utcDay(opts.landedAt); win = zone.landed; basis = 'landed';
  } else if (opts.shippedAt) {
    base = utcDay(opts.shippedAt); win = zone.shipped; basis = 'shipped';
  } else if (opts.placedAt) {
    base = utcDay(opts.placedAt); win = zone.placed; basis = 'placed';
  } else {
    return null;
  }
  let start = base + win[0] * DAY;
  let peakOff = win[2] - win[0];
  if (base + win[1] * DAY < today) {
    start = today + DAY; peakOff = 1; basis = 'fallback';
  }
  const isSunday = (t: number) => new Date(t).getUTCDay() === 0;
  while (isSunday(start)) start += DAY;
  const days: number[] = [];
  for (let t = start; days.length < 5; t += DAY) if (!isSunday(t)) days.push(t);
  return {days, peak: days[Math.min(Math.max(peakOff, 0), 4)], basis};
}

// ------------------------------------------------------------- the view ---

const STEP_TITLES: Array<[TrackStep['key'], string]> = [
  ['placed', 'Order placed'],
  ['packed', 'Packed'],
  ['shipped', 'On its way'],
  ['out', 'Out for delivery'],
  ['delivered', 'Delivered'],
];

interface ViewInput {
  placedAt: number | null;
  shippedAt: number | null; // fulfilment created
  fulfilled: boolean;
  tracking: RawTracking | null;
  country: string | null;
  companyHint: string | null;
  now?: number;
}

function buildView(input: ViewInput): TrackView {
  const now = input.now ?? Date.now();
  const nodes = input.tracking?.nodes ?? [];
  const low = nodes.map((n) => n.text.toLowerCase());
  const latest = low[low.length - 1] ?? '';
  const landed = landedAt(nodes);

  let stage: TrackView['stage'];
  if (latest && DELIVERED_RE.test(latest) && !NOT_DELIVERED_RE.test(latest)) stage = 4;
  else if (
    nodes.some((n) => n.dest) ||
    low.some((t) => OUT_RE.test(t) || PICKUP_RE.test(t) || ATTEMPT_RE.test(t)) ||
    (landed != null && nodes.some((n) => n.at > landed && LOCAL_SORT_RE.test(n.text)))
  ) stage = 3;
  else if (nodes.some((n) => !LABEL_RE.test(n.text))) stage = 2;
  else stage = input.fulfilled ? 1 : 0;

  const special: TrackView['special'] =
    stage !== 4 && latest && PICKUP_RE.test(latest) ? 'pickup' : null;
  const attempt = stage !== 4 && !!latest && ATTEMPT_RE.test(latest);
  const alert = stage !== 4 && !!latest && ALERT_RE.test(latest);

  // Timeframe (business days only).
  const processingEnd = input.placedAt ? addBusinessDays(utcDay(input.placedAt), PROCESSING_BUSINESS_DAYS) : null;
  const fullEnd = processingEnd ? addBusinessDays(processingEnd, DELIVERY_BUSINESS_DAYS) : null;
  const today = utcDay(now);
  let delayed = false;
  if (stage === 0 && processingEnd && today > processingEnd) delayed = true;
  if (stage >= 1 && stage < 4 && fullEnd && today > fullEnd) delayed = true;

  let tone: TrackView['tone'] = 'calm';
  if (stage === 4) tone = 'good';
  else if (alert) tone = 'alert';
  else if (special || attempt) tone = 'action';
  else if (delayed) tone = 'delay';
  else if (stage === 3) tone = 'good';

  let headline: string;
  let message: string;
  if (stage === 4) {
    headline = 'Delivered!';
    message = 'Your parcel has been delivered. We hope you love it! If anything isn’t perfect, just tell us.';
  } else if (alert) {
    headline = 'We need to check something';
    message = 'The carrier reported a problem with this delivery. Please send us a message and we will sort it out for you straight away.';
  } else if (special) {
    headline = 'Waiting for you at a pickup point';
    message = 'Your parcel is ready at a nearby pickup point. Bring an ID and your order number, and check the carrier’s message or SMS for the exact location and opening hours.';
  } else if (attempt) {
    headline = 'The courier tried to deliver';
    message = 'Nobody was available to receive the parcel, so the courier will try again or leave it at a nearby pickup point. Keep an eye on the carrier’s message or SMS.';
  } else if (stage === 0 && delayed) {
    headline = 'Almost ready to ship';
    message = 'This item was so popular that we ordered it especially for you. It’s now with our team and will be on its way very soon. You’ll get an email the moment it ships. Thank you so much for your patience!';
  } else if (delayed) {
    headline = 'Taking a little longer than usual';
    message = 'Some exclusive pairs take a little longer to reach you, but your parcel is on its way and we are keeping a close eye on it. We hope it’s with you very soon!';
  } else if (stage === 0) {
    headline = 'We’re preparing your order';
    message = 'Your order is confirmed and our team is getting it ready. Most orders ship within 1–3 business days, and you’ll get an email as soon as it’s on its way.';
  } else if (stage === 1) {
    headline = 'Packed and ready to go';
    message = 'Your order is packed and has been handed to our delivery partner. The first tracking update usually appears within a few days.';
  } else if (stage === 2) {
    headline = 'On its way to you';
    message = 'Your parcel is with the carrier and travelling to you. Tracking can sometimes pause for a few days while it’s on the move, that’s completely normal.';
  } else {
    headline = 'Almost there!';
    message = 'Your parcel has reached your country and is with the local delivery partner. It’s in the last stretch now!';
  }

  // Local carrier: only once the parcel is in the destination country.
  let localCarrier: string | null = null;
  if (stage >= 3) {
    // The list only holds destination-country carriers, so a pre-landing
    // mention ("in transit to DHL") still names the right local partner.
    const haystack = [
      ...nodes.map((n) => n.text),
      ...(input.tracking?.carrierNames ?? []),
      input.companyHint ?? '',
    ].join(' | ');
    for (const [re, name] of LOCAL_CARRIERS) {
      if (re.test(haystack)) { localCarrier = name; break; }
    }
  }

  const stepAt = (key: TrackStep['key']): number | null => {
    switch (key) {
      case 'placed': return input.placedAt;
      case 'packed': return input.shippedAt;
      case 'shipped': return nodes[0]?.at ?? null;
      case 'out': return landed;
      case 'delivered': return stage === 4 ? nodes[nodes.length - 1]?.at ?? null : null;
    }
  };
  const steps: TrackStep[] = STEP_TITLES.map(([key, title], i) => ({
    key,
    title,
    done: i <= stage,
    current: i === stage,
    at: i <= stage ? stepAt(key) : null,
  }));

  const country = input.country ?? countryCode(input.tracking?.destinationCountry);
  const eta =
    stage < 4
      ? buildEta({
          country,
          landedAt: landed,
          shippedAt: input.shippedAt ?? nodes[0]?.at ?? null,
          placedAt: input.placedAt,
          now,
        })
      : null;

  return {
    stage,
    tone,
    delayed,
    special,
    headline,
    message,
    steps,
    localCarrier,
    attempt,
    details: sanitize(nodes, landed),
    eta,
  };
}

// ---------------------------------------------------------------- items ---

function itemOf(
  title: string,
  variantTitle: string | null,
  qty: number,
  image: {url: string} | null,
): TrackItem {
  const variant = (variantTitle ?? '').trim();
  return {
    title,
    variant: variant && variant.toLowerCase() !== 'default title' ? variant : null,
    qty,
    image: image?.url ? image.url + (image.url.includes('?') ? '&' : '?') + 'width=200' : null,
  };
}

function firstNameOf(...values: Array<string | null | undefined>): string | null {
  for (const v of values) {
    const name = (v ?? '').trim().split(/\s+/)[0];
    if (name && name.length >= 2 && !/[.@]/.test(name)) {
      return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    }
  }
  return null;
}

// ---------------------------------------------------------------- lookup ---

/** "#1055", "1055VC", " # 1055 " → "1055VC"-style key: digits + suffix. */
export function normalizeOrderNumber(raw: string): string | null {
  const v = String(raw ?? '').replace(/[#\s]/g, '').toUpperCase();
  if (!/\d{3,}/.test(v) || v.length > 20) return null;
  return v;
}

export async function lookupOrder(
  env: Env,
  orderNumber: string,
  email: string | null,
  opts: {requireEmail: boolean},
): Promise<TrackResult> {
  const key = normalizeOrderNumber(orderNumber);
  if (!key) throw new TrackError(404, 'not_found', MESSAGES.notFound);
  const digits = key.replace(/\D/g, '');
  const data = await adminQuery<{orders: {nodes: AdminOrder[]}}>(env, ORDER_QUERY, {
    // Order names carry an optional suffix ("#1055VC"), so match both forms.
    query: `name:#${key} OR name:#${digits} OR name:${digits}*`,
  });
  const wanted = email ? email.trim().toLowerCase() : null;
  const order = data.orders.nodes.find((o) => {
    const name = o.name.replace(/[#\s]/g, '').toUpperCase();
    if (name !== key && name.replace(/\D/g, '') !== digits) return false;
    if (!opts.requireEmail) return true;
    const emails = [o.email, o.customer?.email].map((e) => (e ?? '').trim().toLowerCase());
    return !!wanted && emails.includes(wanted);
  });
  if (!order) throw new TrackError(404, 'not_found', MESSAGES.notFound);
  return buildResult(order);
}

export async function buildResult(order: AdminOrder): Promise<TrackResult> {
  const placedAt = Date.parse(order.createdAt) || null;
  const country = order.shippingAddress?.countryCodeV2 ?? null;
  const result: TrackResult = {
    order: order.name,
    firstName: firstNameOf(order.customer?.firstName, order.shippingAddress?.firstName),
    placedAt,
    country,
    parcels: [],
  };

  if (order.cancelledAt) {
    result.notice = {
      tone: 'alert',
      headline: 'This order was cancelled',
      message: 'If you have any questions about this, just send us a message and we’ll gladly help.',
    };
    return result;
  }
  if (order.displayFinancialStatus === 'REFUNDED') {
    result.notice = {
      tone: 'alert',
      headline: 'This order has been refunded',
      message: 'If you have any questions about this, just send us a message and we’ll gladly help.',
    };
    return result;
  }

  const fulfilments = order.fulfillments.filter(
    (f) => f.status === 'SUCCESS' && f.trackingInfo.some((t) => t.number),
  );
  const multi = fulfilments.length > 1;
  for (const [i, f] of fulfilments.entries()) {
    const number = f.trackingInfo.find((t) => t.number)?.number ?? '';
    const {data, paused} = await fetchTracking(number);
    result.parcels.push({
      label: multi ? `Parcel ${i + 1} of ${fulfilments.length}` : null,
      liveUpdatesPaused: paused,
      items: f.fulfillmentLineItems.nodes.map((n) =>
        itemOf(n.lineItem.title, n.lineItem.variantTitle, n.quantity, n.lineItem.image),
      ),
      view: buildView({
        placedAt,
        shippedAt: Date.parse(f.createdAt) || null,
        fulfilled: true,
        tracking: data,
        country,
        companyHint: f.trackingInfo.find((t) => t.company)?.company ?? null,
      }),
    });
  }

  const waitingItems = order.lineItems.nodes
    .filter((li) => li.unfulfilledQuantity > 0)
    .map((li) => itemOf(li.title, li.variantTitle, li.unfulfilledQuantity, li.image));

  if (!result.parcels.length) {
    // Nothing shipped yet: one status card with every item.
    result.parcels.push({
      label: null,
      liveUpdatesPaused: false,
      items: order.lineItems.nodes.map((li) => itemOf(li.title, li.variantTitle, li.quantity, li.image)),
      view: buildView({placedAt, shippedAt: null, fulfilled: false, tracking: null, country, companyHint: null}),
    });
  } else if (waitingItems.length) {
    result.waiting = {
      headline: 'Still being prepared',
      message: 'The rest of your order is being prepared and will travel in a separate parcel. You’ll get an email as soon as it ships.',
      items: waitingItems,
    };
  }
  return result;
}

/** Lookup by tracking number only: parcel status, no personal data. */
export async function lookupNumber(number: string): Promise<TrackResult> {
  const code = String(number ?? '').replace(/\s/g, '');
  if (!/^[A-Za-z0-9-]{6,40}$/.test(code)) {
    throw new TrackError(404, 'not_found', MESSAGES.numberNotFound);
  }
  const {data, paused} = await fetchTracking(code);
  if (!data || !data.nodes.length) {
    throw new TrackError(404, 'not_found', MESSAGES.numberNotFound);
  }
  return {
    order: 'Your parcel',
    firstName: null,
    placedAt: null,
    country: countryCode(data.destinationCountry),
    parcels: [
      {
        label: null,
        liveUpdatesPaused: paused,
        items: [],
        view: buildView({
          placedAt: null,
          shippedAt: data.nodes[0]?.at ?? null,
          fulfilled: true,
          tracking: data,
          country: countryCode(data.destinationCountry),
          companyHint: null,
        }),
      },
    ],
  };
}

// ----------------------------------------------------------- signed link ---

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    {name: 'HMAC', hash: 'SHA-256'},
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Token for `?o=1055&t=…` links in emails: HMAC-SHA256(order number without #). */
export async function verifyLinkToken(env: Env, orderNumber: string, token: string): Promise<boolean> {
  const secret = env.TRACK_LINK_SECRET;
  if (!secret || !token) return false;
  const expected = await hmacHex(secret, orderNumber.replace(/[#\s]/g, ''));
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

// ------------------------------------------------------------ rate limit ---

const ipHits = new Map<string, number[]>();
const orderFails = new Map<string, number[]>();

function prune(map: Map<string, number[]>, key: string, windowMs: number): number[] {
  const now = Date.now();
  const list = (map.get(key) ?? []).filter((t) => now - t < windowMs);
  map.set(key, list);
  if (map.size > 5000) map.clear();
  return list;
}

/** 10 lookups per IP per 10 minutes. */
export function checkIpLimit(ip: string): boolean {
  const list = prune(ipHits, ip, 10 * 60_000);
  if (list.length >= 10) return false;
  list.push(Date.now());
  return true;
}

/** 5 failed lookups per order number per hour. */
export function checkOrderFails(orderKey: string): boolean {
  return prune(orderFails, orderKey, 60 * 60_000).length < 5;
}
export function noteOrderFail(orderKey: string) {
  prune(orderFails, orderKey, 60 * 60_000).push(Date.now());
}

// Exposed for tests / previews.
export const __internal = {rewrite, sanitize, buildView, landedAt};
