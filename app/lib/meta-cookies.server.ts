/**
 * Server-side seeding of Meta's browser cookies.
 *
 * Why this exists: `_fbp` and `_fbc` are normally created by fbevents.js, and
 * Events Manager was reporting ~4% coverage for both. Two independent reasons:
 *
 *  1. TIMING. The SDK is fetched from connect.facebook.net after hydration.
 *     A visitor who lands on a product page from an ad fires ViewContent
 *     within milliseconds of hydration — before the SDK has downloaded and
 *     written `_fbp` — so the Conversions API copy goes out with no browser
 *     id. Since almost every paid session is exactly one landing page, that
 *     is almost every ViewContent.
 *  2. BLOCKING. For the share of EU traffic that blocks connect.facebook.net
 *     outright, the SDK never runs and the cookie is never written at all.
 *
 * Setting both cookies on the HTML response fixes both at once: they exist
 * before a single line of JavaScript executes, and they arrive in the request
 * headers of the relay beacon, which is where `api.meta-events` reads them.
 *
 * This is the supported path, not a workaround — fbevents.js reads an
 * existing `_fbp` and reuses it instead of minting its own, so the browser
 * event and the server event still carry identical values and still
 * deduplicate.
 */

import {
  FBC_COOKIE,
  FBP_COOKIE,
  FB_COOKIE_MAX_AGE_DAYS,
  formatFbc,
  formatFbp,
  rootCookieDomain,
} from '~/lib/pixels';

const MAX_AGE_SECONDS = FB_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;

/** A Meta click id is opaque, but it is always URL-safe base64-ish. */
const FBCLID_PATTERN = /^[\w.-]{6,512}$/;

function readRequestCookie(
  header: string | null,
  name: string,
): string | undefined {
  if (!header) return undefined;
  const match = header.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function serialize(
  name: string,
  value: string,
  hostname: string,
  secure: boolean,
): string {
  const domain = rootCookieDomain(hostname);
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    // Root-domain scope so the value survives the handoff to
    // checkout.<domain>, where the Shopify app fires Purchase.
    domain ? `Domain=${domain}` : null,
    `Max-Age=${MAX_AGE_SECONDS}`,
    'SameSite=Lax',
    secure ? 'Secure' : null,
    // Deliberately NOT HttpOnly: fbevents.js has to be able to read `_fbp`,
    // and the client relay reads both as a fallback.
  ]
    .filter(Boolean)
    .join('; ');
}

export type MetaCookieSeed = {
  /** `Set-Cookie` values to append to the document response. */
  setCookie: string[];
  /**
   * True when at least one cookie is newly minted, in which case the response
   * is visitor-specific and must not be shared by a cache. A response that
   * handed the same `_fbp` to every visitor would collapse the whole audience
   * into one browser id — far worse than the 4% we started from.
   */
  mintedFresh: boolean;
};

/**
 * Decide which Meta cookies this document response should set.
 *
 * `_fbp` is only ever minted once and then left alone. `_fbc` is rewritten
 * whenever a new `fbclid` appears in the URL, because Meta attributes to the
 * most recent click.
 */
export function seedMetaCookies(request: Request): MetaCookieSeed {
  const url = new URL(request.url);
  const hostname = url.hostname;
  const secure = url.protocol === 'https:';
  const cookieHeader = request.headers.get('cookie');
  const subdomainIndex = rootCookieDomain(hostname) ? 1 : 0;

  const setCookie: string[] = [];
  let mintedFresh = false;

  if (!readRequestCookie(cookieHeader, FBP_COOKIE)) {
    setCookie.push(
      serialize(FBP_COOKIE, formatFbp(subdomainIndex), hostname, secure),
    );
    mintedFresh = true;
  }

  const fbclid = url.searchParams.get('fbclid');
  if (fbclid && FBCLID_PATTERN.test(fbclid)) {
    const existing = readRequestCookie(cookieHeader, FBC_COOKIE);
    // Only rewrite when the click id actually changed — a visitor reloading
    // the same ad landing page should keep the original click timestamp.
    if (!existing || !existing.endsWith(`.${fbclid}`)) {
      setCookie.push(
        serialize(
          FBC_COOKIE,
          formatFbc(fbclid, subdomainIndex),
          hostname,
          secure,
        ),
      );
      mintedFresh = true;
    }
  }

  return {setCookie, mintedFresh};
}

/**
 * Expire the person-level identity hashes. Called on sign-out so a shared
 * device stops reporting the previous customer's email hash.
 *
 * Device-level ids (`_fbp`, `_fbc`, `external_id`) are deliberately left
 * alone — those identify a browser, not a person, and Meta's own pixel keeps
 * them across a sign-out too.
 */
export function clearIdentityCookies(request: Request): string[] {
  const url = new URL(request.url);
  const domain = rootCookieDomain(url.hostname);
  const secure = url.protocol === 'https:';
  return ['_vc_em', '_vc_ph', '_vc_fn', '_vc_ln'].map((name) =>
    [
      `${name}=`,
      'Path=/',
      domain ? `Domain=${domain}` : null,
      'Max-Age=0',
      'SameSite=Lax',
      secure ? 'Secure' : null,
    ]
      .filter(Boolean)
      .join('; '),
  );
}
