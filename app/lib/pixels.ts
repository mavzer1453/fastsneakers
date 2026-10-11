/**
 * Shared helpers for third-party advertising pixels on a headless storefront.
 *
 * Shopify's Web Pixels Manager does not run on Hydrogen, so app pixels
 * installed from the Shopify admin (TikTok, Meta) only fire on Shopify-hosted
 * surfaces such as checkout. Anything that happens on this storefront has to
 * be sent to the ad platforms by us. These helpers are platform-agnostic; the
 * platform-specific mapping lives in `tiktok.ts` and `meta.ts`.
 */

export type ProductLike = {
  id?: string | null;
  productId?: string | null;
  variantId?: string | null;
  title?: string | null;
  variantTitle?: string | null;
  vendor?: string | null;
  productType?: string | null;
  price?: string | number | null;
  quantity?: number | null;
};

/**
 * Turn a Shopify GID into the bare numeric id.
 * `gid://shopify/ProductVariant/43876543210` -> `43876543210`
 */
export function gidToId(gid?: string | null): string {
  if (!gid) return '';
  const parts = String(gid).split('/');
  return parts[parts.length - 1] || '';
}

export function toNumber(value?: string | number | null): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Unique id per event occurrence, used for browser/server de-duplication.
 * Both TikTok and Meta match on this id plus the event name.
 */
export function newEventId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}.${rand}`;
}

export function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(
    new RegExp(
      `(?:^|; )${name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1')}=([^;]*)`,
    ),
  );
  return match ? decodeURIComponent(match[1]) : undefined;
}

/**
 * Derive the registrable root domain so cookies are shared with the Shopify
 * checkout subdomain. `fastsneaker.com` and
 * `checkout.fastsneaker.com` must see the same value, otherwise click
 * ids are lost at the checkout handoff and purchases go unattributed.
 */
const MULTI_LABEL_SUFFIXES = [
  // Shopify/Oxygen preview + dev hosts, and generic worker hosts. Browsers
  // reject a Domain attribute that IS a public suffix, so on these we must
  // fall back to a host-only cookie or nothing is stored at all.
  '.myshopify.dev',
  '.myshopify.com',
  '.shopifypreview.com',
  '.oxygen.shopifyapps.com',
  '.shopifycloud.com',
  '.workers.dev',
  '.trycloudflare.com',
  '.ngrok.io',
  '.ngrok-free.app',
  '.co.uk',
  '.com.tr',
  '.com.au',
  '.co.jp',
];

export function rootCookieDomain(hostname: string): string | undefined {
  if (!hostname || hostname === 'localhost' || /^[\d.]+$/.test(hostname)) {
    return undefined;
  }
  const parts = hostname.split('.');
  if (parts.length < 2) return undefined;

  const twoLabel = `.${parts.slice(-2).join('.')}`;
  const suffix = MULTI_LABEL_SUFFIXES.find((candidate) =>
    hostname.endsWith(candidate),
  );
  if (!suffix) return twoLabel;

  // `.co.uk` style: the registrable domain is one label deeper.
  const labelsInSuffix = suffix.split('.').length - 1;
  if (parts.length > labelsInSuffix) {
    return `.${parts.slice(-(labelsInSuffix + 1)).join('.')}`;
  }
  // A bare preview host with nothing to anchor to — host-only cookie.
  return undefined;
}

export function writeRootCookie(name: string, value: string, days: number) {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  const domain = rootCookieDomain(window.location.hostname);
  const domainPart = domain ? `; domain=${domain}` : '';
  const securePart = window.location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${name}=${encodeURIComponent(
    value,
  )}; expires=${expires}; path=/${domainPart}; samesite=lax${securePart}`;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Stable visitor id (Meta `external_id`, TikTok `external_id`)
 *
 * IP + user agent + _fbp/_fbc caps Event Match Quality at about 6/10, because
 * Meta scores on how many identifying parameters arrive with an event. A
 * stable id threads a visitor's events together across sessions and devices
 * and is usually worth 1-2 EMQ points on its own — which directly recovers
 * conversions Meta would otherwise fail to attribute.
 *
 * It is a random value we mint ourselves: no personal data, nothing derived
 * from the device, and it lives in the same root-domain cookie as _fbc so it
 * survives the handoff to checkout.<domain>.
 *
 * Sent RAW on both the browser and the server. Meta normalises external_id
 * identically on each side, so an unhashed value on one and a hash on the
 * other would never match.
 * ──────────────────────────────────────────────────────────────────────────── */

export const EXTERNAL_ID_COOKIE = '_vc_xid';

/** Two years - comfortably longer than any attribution window. */
const EXTERNAL_ID_MAX_AGE_DAYS = 730;

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

/**
 * The visitor's stable id, minting one on first call. Returns undefined on the
 * server, where there is no cookie jar to read or write.
 */
export function getOrCreateExternalId(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const existing = readCookie(EXTERNAL_ID_COOKIE);
  if (existing) return existing;
  const id = randomId();
  writeRootCookie(EXTERNAL_ID_COOKIE, id, EXTERNAL_ID_MAX_AGE_DAYS);
  return id;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Meta browser cookies (_fbp, _fbc)
 *
 * Both are normally minted by fbevents.js. That is the reason Events Manager
 * reported ~4% coverage for each: the SDK is fetched from connect.facebook.net
 * and only writes the cookie once it has downloaded and run, which is
 *   a) after our first ViewContent/PageView has already been relayed, and
 *   b) never at all for the large share of EU traffic that blocks that host.
 *
 * Meta explicitly supports us creating them instead: fbevents.js reads an
 * existing `_fbp` and reuses it rather than generating its own, so the browser
 * event and the Conversions API event still carry an identical value. The
 * format is load-bearing — Meta silently discards anything that does not
 * parse as `fb.<subdomainIndex>.<creationTime>.<payload>`.
 * ──────────────────────────────────────────────────────────────────────────── */

export const FBP_COOKIE = '_fbp';
export const FBC_COOKIE = '_fbc';

/** Meta's click-id attribution window, and what the cookies are scoped to. */
export const FB_COOKIE_MAX_AGE_DAYS = 90;

/**
 * The 10-digit random component of a well-formed `_fbp`.
 *
 * Exactly 10 digits, always: Meta's parser is strict and a shorter or longer
 * run is discarded silently. A single Uint32 draw cannot span 1e9..1e10, so
 * two draws are combined — one picks the third of the range, the other the
 * offset inside it — which stays well under Number.MAX_SAFE_INTEGER.
 */
export function randomFbpSeed(): string {
  const THIRD = 3_000_000_000;
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buffer = new Uint32Array(2);
    crypto.getRandomValues(buffer);
    return String(
      1_000_000_000 + (buffer[0] % 3) * THIRD + (buffer[1] % THIRD),
    );
  }
  return String(Math.floor(1_000_000_000 + Math.random() * 9_000_000_000));
}

/**
 * `fb.<subdomainIndex>.<creationTime>.<random>`
 *
 * `subdomainIndex` is 1 whenever the cookie is written against the
 * registrable domain (`.example.com`), which is what `writeRootCookie` and
 * the server-side seeder both do — that scope is required so the value
 * survives the handoff to `checkout.<domain>`.
 */
export function formatFbp(subdomainIndex = 1, now = Date.now()): string {
  return `fb.${subdomainIndex}.${now}.${randomFbpSeed()}`;
}

/** `fb.<subdomainIndex>.<creationTime>.<fbclid>` */
export function formatFbc(
  fbclid: string,
  subdomainIndex = 1,
  now = Date.now(),
): string {
  return `fb.${subdomainIndex}.${now}.${fbclid}`;
}

/**
 * Guarantee a `_fbp` exists before fbevents.js gets a chance to run.
 *
 * The server seeds this on the HTML response (see `meta-cookies.server.ts`),
 * which covers the overwhelming majority of visits. This is the fallback for
 * the cases the server cannot reach: a page served from the back/forward
 * cache, a client-side navigation into a session that started before this
 * shipped, or any response that bypassed the document handler.
 */
export function ensureFbp(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const existing = readCookie(FBP_COOKIE);
  if (existing) return existing;
  const value = formatFbp(
    rootCookieDomain(window.location.hostname) ? 1 : 0,
  );
  writeRootCookie(FBP_COOKIE, value, FB_COOKIE_MAX_AGE_DAYS);
  return value;
}

/**
 * SHA-256 hex, as Meta requires for personal identifiers (`em`, `ph`, `fn`).
 * Values must be trimmed and lowercased before hashing or the hash will not
 * match the one Meta computes from its own records.
 *
 * Unused until customer identifiers are wired in - kept here so the relay has
 * a single, correct implementation to call.
 */
export async function sha256Hex(value: string): Promise<string | undefined> {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (typeof crypto === 'undefined' || !crypto.subtle) return undefined;
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/* ────────────────────────────────────────────────────────────────────────────
 * Phantom AddToCart suppression
 *
 * Hydrogen's CartAnalytics derives `product_added_to_cart` by diffing the
 * previous cart against the current one. On a fresh page load there IS no
 * previous cart, so every line already sitting in the cart looks new and gets
 * published as an add. Hydrogen's only guard against this is a
 * `cartLastUpdatedAt` value in localStorage, which fails in two cases that
 * are common on this storefront:
 *
 *  1. localStorage is unavailable or has been evicted — private windows, ITP,
 *     and the same privacy-blocking traffic that suppresses the Meta SDK.
 *     `JSON.parse(localStorage.getItem(...) || '')` throws, Hydrogen catches
 *     it, and the guard is skipped entirely.
 *  2. The cart's `updatedAt` moved server-side since the browser last saw it.
 *     This storefront does exactly that: `~/lib/context` pins
 *     `buyerIdentity.countryCode` to the locale, so a geo-redirect or a
 *     currency switch mutates the cart without the browser recording it.
 *
 * Either way the next page load republishes AddToCart for every line in the
 * cart. Those are not adds — nobody added anything — and they teach the ad
 * algorithm to optimise toward an action that did not happen.
 *
 * The discriminator is simple and robust: a real add always follows a click
 * or a keypress. A rehydration artifact is published during mount, before the
 * visitor has touched the page at all.
 * ──────────────────────────────────────────────────────────────────────────── */

const INTERACTION_EVENTS = [
  'pointerdown',
  'keydown',
  'touchstart',
] as const;

let interacted = false;
let watchingInteraction = false;

/** Idempotent; safe to call from every pixel component's mount effect. */
export function watchForUserInteraction() {
  if (typeof window === 'undefined' || watchingInteraction) return;
  watchingInteraction = true;
  const mark = () => {
    interacted = true;
    for (const name of INTERACTION_EVENTS) {
      window.removeEventListener(name, mark, true);
    }
  };
  for (const name of INTERACTION_EVENTS) {
    // Capture phase so this runs even if a handler stops propagation, and
    // passive so it can never delay a scroll or a tap.
    window.addEventListener(name, mark, {capture: true, passive: true});
  }
}

/**
 * True once the visitor has actually touched this page.
 *
 * Resets on every full page load, which is exactly the scope we want — a
 * client-side navigation does not republish cart events (the provider keeps
 * `prevCart` in memory, so the diff is empty), so only full loads can produce
 * the phantom adds this guards against.
 */
export function hasUserInteracted(): boolean {
  // Never armed — no pixel mounted, or this ran on the server. Fail OPEN: a
  // missed phantom event is a rounding error, a suppressed real AddToCart is
  // a lost conversion.
  if (!watchingInteraction) return true;
  return interacted;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bot suppression
 *
 * A catalogue this size gets crawled constantly — Shopify Analytics showed
 * ~32k "sessions" dominated by Prineville OR, Forest City NC, Clonee IE and
 * Luleå SE, which are Meta's own datacentres validating the product feed.
 * Those hits were firing PageView / ViewContent / AddToCart into the pixel,
 * so the ad algorithm was optimising partly against visitors that can never
 * buy, and Shopify's conversion rate was dividing real orders by crawler
 * traffic.
 *
 * Deliberately conservative. A false positive silently drops a real buyer's
 * Purchase event, which is far more damaging than letting a few crawlers
 * through — so this only matches user agents that self-identify as automated.
 * No fingerprinting, no heuristics on screen size or plugin counts.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Ad traffic arrives inside the Facebook, Instagram and TikTok in-app
 * browsers, whose user agents contain the platform's own name. These MUST be
 * treated as human — matching "facebook" or "tiktok" loosely would suppress
 * every single visitor the campaigns pay for.
 */
const IN_APP_BROWSER =
  /\b(FBAN|FBAV|FBIOS|FB_IAB|FBSV|Instagram|BytedanceWebview|musical_ly|Snapchat|Pinterest|Line|OKApp|GSA)\b/i;

/**
 * Crawlers, scrapers and automation clients. Each entry self-identifies as a
 * non-human agent; none of them overlap with a real browser's UA.
 *
 * Note `facebookexternalhit` / `facebookcatalog` / `meta-external*` rather
 * than a bare "facebook" — the former are the feed crawlers, the latter would
 * catch the in-app browser above.
 */
const CRAWLER_UA = new RegExp(
  [
    // Meta's own infrastructure - the bulk of what we saw
    'facebookexternalhit',
    'facebookcatalog',
    'meta-external(agent|fetcher)',
    'facebot',
    // Other search / social crawlers
    'googlebot',
    'google-inspectiontool',
    'storebot-google',
    'bingbot',
    'yandex(bot|images)',
    'duckduckbot',
    'baiduspider',
    'slurp',
    'applebot',
    'bytespider',
    'twitterbot',
    'linkedinbot',
    'whatsapp',
    'telegrambot',
    'discordbot',
    'slackbot',
    'embedly',
    // SEO / monitoring crawlers
    'ahrefsbot',
    'semrushbot',
    'mj12bot',
    'dotbot',
    'petalbot',
    'dataforseo',
    'screaming frog',
    'sitebulb',
    'gtmetrix',
    'pingdom',
    'uptimerobot',
    'lighthouse',
    'chrome-lighthouse',
    'pagespeed',
    // Headless browsers and HTTP clients
    'headlesschrome',
    'phantomjs',
    'puppeteer',
    'playwright',
    'selenium',
    'python-requests',
    'aiohttp',
    'httpx',
    'scrapy',
    'go-http-client',
    'node-fetch',
    'axios',
    'okhttp',
    'curl/',
    'wget',
    'libwww-perl',
    'java/',
    // Generic catch-alls, last so the specific names read first
    'crawler',
    'crawling',
    'spider',
    '\\bbot\\b',
    'bot/',
    'bot;',
  ].join('|'),
  'i',
);

/** Computed once - the user agent cannot change mid-session. */
let cachedIsBot: boolean | null = null;

/**
 * Inject a tracking SDK once the VISITOR is doing something — or, failing
 * that, a good while after the page has finished loading.
 *
 * All three pixels (Meta, TikTok, GA4) work off a queue: the stub function is
 * defined straight away and every call made before the real SDK arrives is
 * replayed when it does. So WHEN the SDK downloads changes nothing about
 * what gets recorded — only about what it competes with.
 *
 * History: injected during hydration they put ~470 KB of script on the main
 * thread exactly when the hero image and React needed it. Moving them to
 * `load` + idle fixed that for shoppers, but they still landed inside the
 * window PageSpeed measures (it keeps recording for a few seconds after
 * `load`): ~740 ms of CPU and 245 KB of "unused JavaScript" in every report,
 * all three of them.
 *
 * Now: wait for `load`, then for the first sign of a person — a scroll, a
 * touch, a pointer move, a key — and inject in the next idle moment. Someone
 * who never touches the page still gets the SDKs after `capMs`. Real visitors
 * scroll or tap almost at once, so for them this fires about when it used to.
 *
 * The cost, stated plainly: a visitor who leaves inside `capMs` without ever
 * touching the page is gone before the browser SDKs load. Meta still hears
 * about them (PageView is relayed through the Conversions API from the
 * server); TikTok and GA4 do not. That visitor did not scroll once.
 */
const ENGAGEMENT_EVENTS = [
  'scroll',
  'pointerdown',
  'pointermove',
  'touchstart',
  'keydown',
  'wheel',
] as const;

export function whenVisitorEngages(load: () => void, capMs = 8000) {
  if (typeof window === 'undefined') return;
  let done = false;
  let pageLoaded = document.readyState === 'complete';
  let engaged = false;

  const stopListening = () => {
    for (const name of ENGAGEMENT_EVENTS) {
      window.removeEventListener(name, onEngage, true);
    }
  };
  const run = () => {
    if (done) return;
    done = true;
    stopListening();
    // Idle, so the download is requested between frames of whatever the
    // visitor just started doing rather than in the middle of one.
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(load, {timeout: 1500});
    } else {
      // Safari has no requestIdleCallback.
      window.setTimeout(load, 300);
    }
  };
  function onEngage() {
    engaged = true;
    stopListening();
    if (pageLoaded) run();
  }
  const onLoad = () => {
    pageLoaded = true;
    if (engaged) run();
    else window.setTimeout(run, capMs);
  };

  for (const name of ENGAGEMENT_EVENTS) {
    // Capture + passive: sees the event whatever the page does with it, and
    // can never delay a scroll or a tap.
    window.addEventListener(name, onEngage, {capture: true, passive: true});
  }
  if (pageLoaded) onLoad();
  else window.addEventListener('load', onLoad, {once: true});
}

/**
 * True when the current visitor is almost certainly automated, in which case
 * no pixel event (browser or Conversions API) should be sent for them.
 *
 * Server-side this returns `false`: there is no `navigator`, and the pixel
 * components only ever call it from effects that run after hydration.
 */
export function isLikelyBot(): boolean {
  if (cachedIsBot !== null) return cachedIsBot;
  if (typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent || '';

  // Automation frameworks set this flag; real browsers leave it undefined.
  const isAutomated = navigator.webdriver === true;

  // In-app browsers win over the crawler list - see IN_APP_BROWSER above.
  const isCrawler = !IN_APP_BROWSER.test(ua) && CRAWLER_UA.test(ua);

  cachedIsBot = isAutomated || isCrawler;
  return cachedIsBot;
}
