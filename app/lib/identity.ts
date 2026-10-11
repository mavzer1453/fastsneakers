/**
 * Hashed visitor identity for advertising match quality.
 *
 * Events Manager grades every event on how many identifying parameters
 * arrive with it. IP + user agent + _fbp + _fbc + external_id tops out around
 * 6/10; an email hash is the single parameter that pushes it to 8-9/10,
 * because it is the one signal Meta can match against a real account rather
 * than against a device.
 *
 * PRIVACY CONTRACT — the whole point of this module:
 *  - A raw email or phone number is hashed the instant we see it and the raw
 *    value is discarded. It is never written to a cookie, never sent to our
 *    own server, never sent to Meta, and never logged.
 *  - Only SHA-256 hex lands in storage. A hash cannot be reversed to an
 *    address; it only lets Meta check "do I already know this person".
 *  - `~/routes/api.meta-events` independently rejects any `em`/`ph`/`fn`/`ln`
 *    that is not a 64-char hex digest, so a mistake here cannot leak a raw
 *    value through the relay either.
 *
 * Normalisation must match Meta's exactly or the hashes will not compare:
 * trim, lowercase, and for phone numbers digits only in E.164 order.
 */

import {
  readCookie,
  rootCookieDomain,
  sha256Hex,
  writeRootCookie,
} from '~/lib/pixels';

/** One year — long enough to span any realistic repeat-purchase cycle. */
const IDENTITY_MAX_AGE_DAYS = 365;

export const EMAIL_HASH_COOKIE = '_vc_em';
export const PHONE_HASH_COOKIE = '_vc_ph';
export const FIRST_NAME_HASH_COOKIE = '_vc_fn';
export const LAST_NAME_HASH_COOKIE = '_vc_ln';

/** The shape both `fbq` advanced matching and the Conversions API expect. */
export type HashedIdentity = {
  em?: string;
  ph?: string;
  fn?: string;
  ln?: string;
};

const SHA256_HEX = /^[a-f0-9]{64}$/;

export function isSha256Hex(value: unknown): value is string {
  return typeof value === 'string' && SHA256_HEX.test(value);
}

/**
 * Digits only, in E.164 order and without the leading `+`, which is how Meta
 * normalises before hashing. Returns undefined for anything that cannot be a
 * dialable international number — a bad guess is worse than no parameter,
 * since a hash that matches nobody only dilutes the score.
 */
export function normalizePhone(raw: string): string | undefined {
  let digits = raw.replace(/\D/g, '');
  // `0049...` is the international prefix written out long-hand.
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length < 8 || digits.length > 15) return undefined;
  return digits;
}

/** Meta lowercases and strips punctuation from names before hashing. */
export function normalizeName(raw: string): string | undefined {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
  return cleaned || undefined;
}

export function readIdentity(): HashedIdentity {
  if (typeof document === 'undefined') return {};
  const identity: HashedIdentity = {};
  const em = readCookie(EMAIL_HASH_COOKIE);
  const ph = readCookie(PHONE_HASH_COOKIE);
  const fn = readCookie(FIRST_NAME_HASH_COOKIE);
  const ln = readCookie(LAST_NAME_HASH_COOKIE);
  if (isSha256Hex(em)) identity.em = em;
  if (isSha256Hex(ph)) identity.ph = ph;
  if (isSha256Hex(fn)) identity.fn = fn;
  if (isSha256Hex(ln)) identity.ln = ln;
  return identity;
}

/**
 * Fired whenever a new hash lands, so the already-mounted pixel components can
 * re-run `fbq('init', ...)` with the richer advanced-matching set instead of
 * waiting for the next full page load.
 */
export const IDENTITY_EVENT = 'vc:identity';

/** Store an already-hashed identity, e.g. one computed on the server. */
export function rememberHashedIdentity(identity: HashedIdentity): HashedIdentity {
  if (typeof document === 'undefined') return {};
  const stored: HashedIdentity = {};
  const pairs = [
    [EMAIL_HASH_COOKIE, identity.em, 'em'],
    [PHONE_HASH_COOKIE, identity.ph, 'ph'],
    [FIRST_NAME_HASH_COOKIE, identity.fn, 'fn'],
    [LAST_NAME_HASH_COOKIE, identity.ln, 'ln'],
  ] as const;
  for (const [cookie, value, key] of pairs) {
    if (!isSha256Hex(value)) continue;
    if (readCookie(cookie) !== value) {
      writeRootCookie(cookie, value, IDENTITY_MAX_AGE_DAYS);
    }
    stored[key] = value;
  }
  if (Object.keys(stored).length > 0) {
    window.dispatchEvent(new CustomEvent(IDENTITY_EVENT, {detail: stored}));
  }
  return stored;
}

/**
 * Hash a raw identifier and store the digest. The raw string is local to this
 * function and goes out of scope with it.
 */
export async function rememberIdentity(raw: {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): Promise<HashedIdentity> {
  const identity: HashedIdentity = {};
  try {
    if (raw.email) {
      identity.em = await sha256Hex(raw.email);
    }
    if (raw.phone) {
      const normalized = normalizePhone(raw.phone);
      if (normalized) identity.ph = await sha256Hex(normalized);
    }
    if (raw.firstName) {
      const normalized = normalizeName(raw.firstName);
      if (normalized) identity.fn = await sha256Hex(normalized);
    }
    if (raw.lastName) {
      const normalized = normalizeName(raw.lastName);
      if (normalized) identity.ln = await sha256Hex(normalized);
    }
  } catch {
    // Hashing is best-effort: no crypto.subtle (insecure context) simply
    // means this visitor contributes no email parameter.
    return {};
  }
  return rememberHashedIdentity(identity);
}

/**
 * Drop every stored hash. Called on sign-out so a shared device does not keep
 * reporting the previous customer's identity.
 */
export function forgetIdentity() {
  if (typeof document === 'undefined') return;
  const domain = rootCookieDomain(window.location.hostname);
  const domainPart = domain ? `; domain=${domain}` : '';
  for (const cookie of [
    EMAIL_HASH_COOKIE,
    PHONE_HASH_COOKIE,
    FIRST_NAME_HASH_COOKIE,
    LAST_NAME_HASH_COOKIE,
  ]) {
    document.cookie = `${cookie}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domainPart}`;
  }
}
