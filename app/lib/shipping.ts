/**
 * Shipping zones & rates — the single source of truth for the storefront.
 * MUST match the delivery profile configured in Shopify admin (the rates
 * there are what checkout actually charges; this file drives the shipping
 * page and the cart's free-shipping meter).
 *
 * All thresholds are order subtotals in EUR.
 */

export interface ShippingTier {
  /** Subtotal must be strictly below this to pay `price` (Infinity = top tier). */
  upTo: number;
  /** Shipping price in EUR. 0 = free. */
  price: number;
}

export interface ShippingZone {
  key: string;
  /** Customer-facing zone name (English). */
  label: string;
  /** ISO country codes covered by this zone. */
  countries: string[];
  /** Ordered cheapest-last: [under-35, mid, free]. */
  tiers: ShippingTier[];
}

// Every order ships FREE, everywhere — no minimum. The zone split is kept
// so the shipping page can still list destinations (and so per-zone rates
// can come back later by editing only this file + the Shopify profile).
export const SHIPPING_ZONES: ShippingZone[] = [
  {
    key: 'benelux',
    label: 'Netherlands & Belgium',
    countries: ['NL', 'BE'],
    tiers: [{upTo: Infinity, price: 0}],
  },
  {
    key: 'west',
    label: 'United Kingdom, Denmark, France, Italy & Austria',
    countries: ['GB', 'DK', 'FR', 'IT', 'AT'],
    tiers: [{upTo: Infinity, price: 0}],
  },
  {
    key: 'south-east',
    label:
      'Sweden, Spain, Poland, Czechia, Serbia, Montenegro, Sierra Leone, Finland, Greece, Türkiye, Portugal & Cyprus',
    countries: [
      'SE',
      'ES',
      'PL',
      'CZ',
      'RS',
      'ME',
      'SL',
      'FI',
      'GR',
      'TR',
      'PT',
      'CY',
    ],
    tiers: [{upTo: Infinity, price: 0}],
  },
  {
    key: 'alpine-north',
    label: 'Switzerland, Norway, Ireland, San Marino, Latvia & Estonia',
    countries: ['CH', 'NO', 'IE', 'SM', 'LV', 'EE'],
    tiers: [{upTo: Infinity, price: 0}],
  },
  {
    key: 'north-america',
    label: 'United States & Canada',
    countries: ['US', 'CA'],
    // Shipping itself is free here too. What US and Canadian orders pay is a
    // separate import charge — see DUTIES_TIERS below.
    tiers: [{upTo: Infinity, price: 0}],
  },
];

/** Every other country we ship to uses this schedule. */
export const REST_ZONE: ShippingZone = {
  key: 'rest',
  label: 'All other destinations',
  countries: [],
  tiers: [{upTo: Infinity, price: 0}],
};

/**
 * Import duties on orders into the United States and Canada.
 *
 * These parcels clear customs as imports, so unlike every other destination
 * they carry a charge — but it is an import charge, not a shipping fee, and
 * checkout bills it under its own rate name, "Duties & handling". Shipping
 * stays free.
 *
 * MUST match the North America zone of the Shopify delivery profile
 * (`gid://shopify/DeliveryZone/684173263235`), whose rates are conditioned on
 * TOTAL_PRICE in EUR. Change one and you must change the other, or the site
 * quotes a number checkout does not charge.
 *
 * Shopify's tier conditions overlap on the boundaries (each rate is
 * `>= low` AND `<= high`), so an order sitting exactly on one is offered both
 * rates and the shopper takes the cheaper. `dutiesFor` matches that by
 * treating `upTo` as inclusive.
 */
// 29 Sep 2026: checkout does NOT collect duties (Shopify → Taxes and duties:
// "Collecting in 0 markets"; the North America zone has one free rate only).
// Empty list = no duties line in the cart or on the shipping page. To bring
// duties back, add the rates in Shopify first, then list the countries here.
export const DUTIES_COUNTRIES: string[] = [];

export const DUTIES_TIERS: ShippingTier[] = [
  {upTo: 75, price: 8},
  {upTo: 125, price: 14},
  {upTo: 175, price: 22},
  {upTo: 225, price: 30},
  {upTo: 300, price: 39},
  {upTo: Infinity, price: 52},
];

/** True for destinations that pay import duties at checkout. */
export function hasDuties(countryCode?: string | null): boolean {
  if (!countryCode) return false;
  return DUTIES_COUNTRIES.includes(countryCode.toUpperCase());
}

/**
 * Duties in EUR for an order of this subtotal into this country, or null
 * where no duties apply (everywhere outside the United States and Canada).
 */
export function dutiesFor(
  countryCode: string | null | undefined,
  subtotalEur: number,
): number | null {
  if (!hasDuties(countryCode)) return null;
  for (const tier of DUTIES_TIERS) {
    if (subtotalEur <= tier.upTo) return tier.price;
  }
  return DUTIES_TIERS[DUTIES_TIERS.length - 1].price;
}

export function zoneForCountry(countryCode?: string | null): ShippingZone {
  if (!countryCode) return SHIPPING_ZONES[0]; // default market: NL
  const code = countryCode.toUpperCase();
  return (
    SHIPPING_ZONES.find((zone) => zone.countries.includes(code)) ?? REST_ZONE
  );
}

/** Subtotal at which shipping becomes free for the zone. */
export function freeShippingThreshold(zone: ShippingZone): number {
  const freeTier = zone.tiers.find((tier) => tier.price === 0);
  const index = zone.tiers.indexOf(freeTier!);
  return index > 0 ? zone.tiers[index - 1].upTo : 0;
}

/** Shipping price for a given subtotal in this zone. */
export function shippingPriceFor(zone: ShippingZone, subtotal: number): number {
  for (const tier of zone.tiers) {
    if (subtotal < tier.upTo) return tier.price;
  }
  return 0;
}

/**
 * The next money-saving milestone above the current subtotal, or null when
 * shipping is already free. Powers the "add €X more" nudge in the cart.
 */
export function nextMilestone(
  zone: ShippingZone,
  subtotal: number,
): {remaining: number; price: number; isFree: boolean} | null {
  for (let index = 0; index < zone.tiers.length; index++) {
    const tier = zone.tiers[index];
    if (subtotal < tier.upTo) {
      const next = zone.tiers[index + 1];
      if (!next) return null;
      return {
        remaining: tier.upTo - subtotal,
        price: next.price,
        isFree: next.price === 0,
      };
    }
  }
  return null;
}

export function formatEur(amount: number): string {
  return `€${amount.toFixed(2).replace('.', ',')}`;
}

/**
 * Approximate EUR exchange rates for the display currencies we offer, so
 * the free-shipping meter can motivate shoppers in ANY currency. Only used
 * for the progress UI — checkout converts with Shopify's live rates, so
 * the meter is a good-faith estimate, never a price promise.
 */
const APPROX_EUR_RATES: Record<string, number> = {
  EUR: 1,
  USD: 1.09,
  GBP: 0.85,
  CHF: 0.94,
  DKK: 7.46,
  SEK: 11.3,
  NOK: 11.6,
  PLN: 4.3,
  CZK: 25.2,
  HUF: 395,
  RON: 4.97,
  BGN: 1.96,
  ISK: 149,
  RSD: 117,
  BAM: 1.96,
  MKD: 61.6,
  ALL: 100,
  MDL: 19.2,
  BYN: 3.55,
  CAD: 1.48,
  AUD: 1.65,
  NZD: 1.78,
  TRY: 44,
};

/** Convert a cart-currency amount to EUR (approximate). Null if unknown. */
export function approxToEur(
  amount: number,
  currencyCode?: string | null,
): number | null {
  const rate = APPROX_EUR_RATES[currencyCode ?? ''];
  return rate ? amount / rate : null;
}

/** Convert a EUR amount into the cart currency (approximate). */
export function approxFromEur(amountEur: number, currencyCode: string): number {
  const rate = APPROX_EUR_RATES[currencyCode] ?? 1;
  return amountEur * rate;
}

/** Locale-correct money string for any of our display currencies. */
export function formatMoney(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}
