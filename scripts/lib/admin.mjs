/**
 * Shared Admin API client.
 *
 * Shopify's GraphQL rate limit is cost-based, not request-based, and it does
 * NOT come back as HTTP 429 — the response is a normal 200 with the error in
 * `json.errors`. Retry logic that only watches the status code never sees it,
 * which is how the first version of fix-compare-at.mjs died on its opening
 * call with THROTTLED.
 *
 * Two things keep a long run alive:
 *
 *   1. Retry on THROTTLED found in the body, with backoff.
 *   2. Watch `extensions.cost.throttleStatus.currentlyAvailable` and pause
 *      before the bucket empties, rather than after being refused.
 *
 * The other half of the problem is query cost, which the caller owns: the
 * bucket is 1000 points and `products(first: N)` with `variants(first: M)`
 * costs roughly N × (1 + M). Asking for 40 products with 100 variants each is
 * ~4000 points — throttled on the first call every time, no matter how good
 * the retry logic is. Keep N × M under about 800.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createAdminClient({
  shop,
  clientId,
  clientSecret,
  apiVersion = '2025-07',
}) {
  const endpoint = `https://${shop}.myshopify.com/admin/api/${apiVersion}/graphql.json`;
  let token = null;
  let tokenExpiresAt = 0;

  async function getToken() {
    if (token && Date.now() < tokenExpiresAt - 60_000) return token;
    const res = await fetch(
      `https://${shop}.myshopify.com/admin/oauth/access_token`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
        }),
      },
    );
    if (!res.ok) throw new Error(`Token request failed: ${res.status}`);
    const json = await res.json();
    token = json.access_token;
    tokenExpiresAt = Date.now() + (json.expires_in ?? 86400) * 1000;
    return token;
  }

  async function gql(query, variables = {}, attempt = 0) {
    let res;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': await getToken(),
        },
        body: JSON.stringify({query, variables}),
      });
    } catch (error) {
      // Dropped connection mid-run; the catalogue is big enough that this
      // happens on a long pass.
      if (attempt >= 6) throw error;
      await sleep(2000 * (attempt + 1));
      return gql(query, variables, attempt + 1);
    }

    if (res.status === 429 || res.status >= 500) {
      if (attempt >= 6) throw new Error(`Admin API ${res.status}`);
      const retryAfter = Number(res.headers.get('Retry-After') ?? 0) * 1000;
      await sleep(retryAfter || 2000 * (attempt + 1));
      return gql(query, variables, attempt + 1);
    }

    const json = await res.json();

    if (json.errors) {
      const throttled = json.errors.some(
        (error) => error.extensions?.code === 'THROTTLED',
      );
      if (throttled && attempt < 8) {
        // Backs off harder than a network retry: the bucket refills on a
        // timer, so waiting is the only thing that helps.
        await sleep(2000 * (attempt + 1));
        return gql(query, variables, attempt + 1);
      }
      throw new Error(`GraphQL: ${JSON.stringify(json.errors).slice(0, 300)}`);
    }

    // Pause before the bucket runs dry rather than after being refused.
    const throttle = json.extensions?.cost?.throttleStatus;
    if (throttle && throttle.currentlyAvailable < 300) await sleep(1000);

    return json.data;
  }

  return {gql, getToken};
}
