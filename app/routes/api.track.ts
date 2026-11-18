import type {Route} from './+types/api.track';
import {
  MESSAGES,
  TrackError,
  checkIpLimit,
  checkOrderFails,
  lookupNumber,
  lookupOrder,
  noteOrderFail,
  normalizeOrderNumber,
  verifyLinkToken,
} from '~/lib/track.server';

/**
 * JSON backend for /pages/track-order (same contract as the MeraFashion
 * tracking worker, served from our own Oxygen deployment instead):
 *
 *   POST /api/track            {"order":"1055","email":"x@y.com"}
 *   GET  /api/track?o=1055&t=… signed link from emails (no email needed)
 *   GET  /api/track?nums=…     parcel status only, no personal data
 *   GET  /api/track?health=1   {"ok":true}
 *
 * Errors never say which half was wrong (order vs email) — that would let
 * people enumerate orders.
 */

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  vary: 'origin',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};

function json(body: unknown, status = 200, request?: Request) {
  const headers: Record<string, string> = {...HEADERS};
  const origin = request?.headers.get('origin');
  if (origin && sameSite(origin, request)) {
    headers['access-control-allow-origin'] = origin;
  }
  return new Response(JSON.stringify(body), {status, headers});
}

/** Same registrable domain as the storefront (www / apex / checkout host). */
function sameSite(origin: string, request?: Request): boolean {
  try {
    const o = new URL(origin).hostname.split('.').slice(-2).join('.');
    const h = new URL(request?.url ?? '').hostname.split('.').slice(-2).join('.');
    return o === h;
  } catch {
    return false;
  }
}

function clientIp(request: Request): string {
  return (
    request.headers.get('oxygen-buyer-ip') ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function fail(error: unknown, request: Request) {
  if (error instanceof TrackError) {
    return json({error: error.code, message: error.message}, error.status, request);
  }
  console.log('track: unexpected', error instanceof Error ? error.message : error);
  return json({error: 'unavailable', message: MESSAGES.unavailable}, 502, request);
}

export async function loader({request, context}: Route.LoaderArgs) {
  const url = new URL(request.url);
  if (url.searchParams.get('health')) return json({ok: true}, 200, request);

  if (!checkIpLimit(clientIp(request))) {
    return json({error: 'rate_limited', message: MESSAGES.rateLimited}, 429, request);
  }

  const nums = url.searchParams.get('nums');
  const o = url.searchParams.get('o');
  const t = url.searchParams.get('t');
  try {
    if (nums) {
      const result = await lookupNumber(nums);
      return json(result, 200, request);
    }
    if (o && t) {
      const key = normalizeOrderNumber(o);
      if (!key || !(await verifyLinkToken(context.env, o, t))) {
        return json({error: 'not_found', message: MESSAGES.notFound}, 404, request);
      }
      const result = await lookupOrder(context.env, o, null, {requireEmail: false});
      return json(result, 200, request);
    }
    return json({error: 'bad_request'}, 400, request);
  } catch (error) {
    return fail(error, request);
  }
}

export async function action({request, context}: Route.ActionArgs) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {status: 204, headers: HEADERS});
  }
  if (request.method !== 'POST') {
    return json({error: 'not_found'}, 404, request);
  }
  if (!checkIpLimit(clientIp(request))) {
    return json({error: 'rate_limited', message: MESSAGES.rateLimited}, 429, request);
  }
  const raw = await request.text();
  if (raw.length > 2048) return json({error: 'bad_request'}, 400, request);
  let body: {order?: unknown; email?: unknown} = {};
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return json({error: 'bad_request'}, 400, request);
  }
  const order = typeof body.order === 'string' ? body.order : '';
  const email = typeof body.email === 'string' ? body.email : '';
  const key = normalizeOrderNumber(order);
  if (!key || !email) {
    return json({error: 'not_found', message: MESSAGES.notFound}, 404, request);
  }
  if (!checkOrderFails(key)) {
    return json({error: 'rate_limited', message: MESSAGES.rateLimited}, 429, request);
  }
  try {
    const result = await lookupOrder(context.env, order, email, {requireEmail: true});
    console.log('track: ok', result.order);
    return json(result, 200, request);
  } catch (error) {
    if (error instanceof TrackError && error.status === 404) noteOrderFail(key);
    console.log('track: miss', key, error instanceof TrackError ? error.code : 'error');
    return fail(error, request);
  }
}
