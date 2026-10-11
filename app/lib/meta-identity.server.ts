/**
 * Hashed identity for a signed-in customer, computed on the server.
 *
 * Meta's "Send Email address to improve conversion reporting" prompt is asking
 * for the `em` parameter. For a signed-in shopper we already hold a verified
 * address, which is a far better signal than anything we could scrape from a
 * form — so we hash it here, on the server, and hand only the digest to the
 * client.
 *
 * The raw address never leaves this function: it is read from the Customer
 * Account API response, hashed, and the response object goes out of scope.
 * Nothing raw is returned to the browser, put in a cookie, or logged.
 */

import type {HydrogenRouterContextProvider} from '@shopify/hydrogen';
import {CUSTOMER_IDENTITY_QUERY} from '~/graphql/customer-account/CustomerIdentity';
import {
  normalizeName,
  normalizePhone,
  type HashedIdentity,
} from '~/lib/identity';
import {sha256Hex} from '~/lib/pixels';

/**
 * Never rejects and never blocks the critical path — a signed-out visitor, an
 * expired token or an API hiccup all resolve to `null`, which simply means
 * this visitor contributes no email parameter.
 */
export async function loadMetaIdentity(
  customerAccount: HydrogenRouterContextProvider['customerAccount'],
): Promise<HashedIdentity | null> {
  try {
    if (!(await customerAccount.isLoggedIn())) return null;

    const {data, errors} = await customerAccount.query(CUSTOMER_IDENTITY_QUERY);
    if (errors?.length) return null;

    // Typed, not `as any`: now that the query lives under
    // app/graphql/customer-account/ codegen registers it and the response
    // shape is checked. The cast that used to be here was the only reason
    // the schema mismatch behind it went unnoticed.
    const customer = data?.customer;
    if (!customer) return null;

    const email = customer.emailAddress?.emailAddress ?? undefined;
    const phone = customer.phoneNumber?.phoneNumber ?? undefined;

    const identity: HashedIdentity = {};
    if (email) identity.em = await sha256Hex(email);
    if (phone) {
      const normalized = normalizePhone(phone);
      if (normalized) identity.ph = await sha256Hex(normalized);
    }
    if (customer.firstName) {
      const normalized = normalizeName(customer.firstName);
      if (normalized) identity.fn = await sha256Hex(normalized);
    }
    if (customer.lastName) {
      const normalized = normalizeName(customer.lastName);
      if (normalized) identity.ln = await sha256Hex(normalized);
    }

    return Object.keys(identity).length > 0 ? identity : null;
  } catch {
    return null;
  }
}
