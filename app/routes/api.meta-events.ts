import type {Route} from './+types/api.meta-events';
import {CAPI_EVENTS, type CapiEventName} from '~/lib/meta';
import {EXTERNAL_ID_COOKIE} from '~/lib/pixels';

/**
 * First-party relay for Meta's Conversions API (server-side events).
 *
 * The browser pixel (MetaPixel.tsx) fires each event twice: once via fbq
 * (browser → Meta) and once as a beacon to this route (browser → our server →
 * Meta). Both carry the same `event_id`, so Meta deduplicates the pair. The
 * server copy survives ad blockers and browser privacy features, and adds
 * match signals (IP, user agent, _fbp/_fbc) that improve attribution.
 *
 * Does nothing until META_CAPI_ACCESS_TOKEN is set (Events Manager → your
 * pixel → Settings → Conversions API → Generate access token), so deploying
 * without the token is safe.
 *
 * Checkout/Purchase events are NOT handled here — the Facebook & Instagram
 * app on the Shopify backend already sends those (browser + CAPI).
 */

/** Meta Graph API version — released Feb 2026; bump ~yearly. */
const GRAPH_VERSION = 'v25.0';

/** custom_data keys we forward; anything else in the beacon is dropped. */
const ALLOWED_CUSTOM_DATA_KEYS = [
  'content_ids',
  'contents',
  'content_type',
  'content_name',
  'content_category',
  'content_variant',
  'num_items',
  'value',
  'currency',
  'search_string',
] as const;

function clientIp(request: Request): string | undefined {
  // Oxygen forwards the real buyer IP in this header.
  const direct = request.headers.get('oxygen-buyer-ip');
  if (direct) return direct;
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || undefined;
}

function cookieValue(
  header: string | null,
  name: string,
): string | undefined {
  if (!header) return undefined;
  const match = header.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

// Browsers only POST here; anything else gets a 405.
export async function loader() {
  return new Response(null, {status: 405});
}

export async function action({request, context}: Route.ActionArgs) {
  if (request.method !== 'POST') return new Response(null, {status: 405});

  const accessToken = context.env.META_CAPI_ACCESS_TOKEN;
  const pixelId = context.env.PUBLIC_META_PIXEL_ID;
  // Not configured yet — accept and drop so the storefront never errors.
  if (!accessToken || !pixelId) return new Response(null, {status: 204});

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response(null, {status: 400});
  }

  const eventName = body.event_name;
  const eventId = body.event_id;
  if (
    typeof eventName !== 'string' ||
    !(CAPI_EVENTS as readonly string[]).includes(eventName) ||
    typeof eventId !== 'string' ||
    !eventId
  ) {
    return new Response(null, {status: 400});
  }

  // Only accept page URLs that belong to this storefront.
  const origin = new URL(request.url).origin;
  const eventSourceUrl =
    typeof body.event_source_url === 'string' &&
    body.event_source_url.startsWith(origin)
      ? body.event_source_url
      : origin;

  const rawCustomData = (body.custom_data ?? {}) as Record<string, unknown>;
  const customData: Record<string, unknown> = {};
  for (const key of ALLOWED_CUSTOM_DATA_KEYS) {
    if (rawCustomData[key] !== undefined) customData[key] = rawCustomData[key];
  }

  // Match signals. Cookies from the request header are the source of truth;
  // the beacon body values are a fallback.
  const cookieHeader = request.headers.get('cookie');
  const userData: Record<string, string> = {};
  const ip = clientIp(request);
  const userAgent = request.headers.get('user-agent');
  const fbp =
    cookieValue(cookieHeader, '_fbp') ??
    (typeof body.fbp === 'string' ? body.fbp : undefined);
  const fbc =
    cookieValue(cookieHeader, '_fbc') ??
    (typeof body.fbc === 'string' ? body.fbc : undefined);
  // Stable visitor id. Sent RAW, exactly as the browser sends it to fbq —
  // Meta normalises both sides the same way, so a hash here and a plain value
  // there would never match.
  const externalId =
    cookieValue(cookieHeader, EXTERNAL_ID_COOKIE) ??
    (typeof body.external_id === 'string' ? body.external_id : undefined);

  if (ip) userData.client_ip_address = ip;
  if (userAgent) userData.client_user_agent = userAgent;
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;
  if (externalId) userData.external_id = externalId;

  // Personal identifiers, if the caller has any. Accepted ONLY pre-hashed:
  // raw email or phone must never cross this boundary or land in a log.
  // Nothing populates these yet — the plumbing is here so wiring customer
  // accounts in later is a one-line change on the sending side.
  const SHA256_HEX = /^[a-f0-9]{64}$/;
  for (const key of ['em', 'ph', 'fn', 'ln'] as const) {
    const value = body[key];
    if (typeof value === 'string' && SHA256_HEX.test(value)) {
      userData[key] = value;
    }
  }

  // Prefer the browser's timestamp: a beacon queued on page unload can arrive
  // seconds late, and Meta rejects anything older than 7 days. Guard against a
  // skewed client clock by only trusting a value inside that window.
  const now = Math.floor(Date.now() / 1000);
  const claimed = typeof body.event_time === 'number' ? body.event_time : null;
  const eventTime =
    claimed && claimed <= now + 60 && claimed > now - 6 * 86400 ? claimed : now;

  const event = {
    event_name: eventName as CapiEventName,
    event_time: eventTime,
    event_id: eventId,
    event_source_url: eventSourceUrl,
    action_source: 'website',
    user_data: userData,
    ...(Object.keys(customData).length > 0 ? {custom_data: customData} : {}),
  };

  const testEventCode = context.env.META_TEST_EVENT_CODE;
  const payload = {
    data: [event],
    ...(testEventCode ? {test_event_code: testEventCode} : {}),
  };

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(
        accessToken,
      )}`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok) {
      console.error(
        '[meta-capi]',
        response.status,
        (await response.text()).slice(0, 500),
      );
    }
  } catch (error) {
    console.error('[meta-capi] request failed', error);
  }

  // The beacon sender never reads the response — always succeed quietly.
  return new Response(null, {status: 204});
}
