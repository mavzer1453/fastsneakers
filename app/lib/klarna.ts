/**
 * Which Klarna option a shopper can actually be offered, so the line under
 * the product price never promises a plan their checkout will not show.
 *
 * Source: Stripe's Klarna "payment options by country" table (Shopify
 * Payments' Klarna runs on the same rails), read 2026-09-21. Klarna decides
 * these and changes them from time to time — re-check the table before adding
 * a market. Limits are in the market's own currency.
 *
 *   Pay in 3   AT CH CZ DE DK ES FR GB GR IE IT NL NO PL PT RO
 *   Pay in 4   AU CA NZ US
 *   Pay later only (no instalments)   BE FI SE
 *   Pay later is offered everywhere above except AU, CA, IE, NZ.
 *
 * Belgium — the shop's home market — is in the "Pay later only" group, which
 * is why this is keyed by the visitor's COUNTRY and not just the currency.
 */
export type KlarnaPlan =
  | {kind: 'instalments'; count: 3 | 4; payLater: boolean}
  | {kind: 'later'};

interface Market {
  currency: string;
  plan: KlarnaPlan;
  min: number;
  max: number;
}

const in3 = (
  currency: string,
  min: number,
  max: number,
  payLater = true,
): Market => ({
  currency,
  min,
  max,
  plan: {kind: 'instalments', count: 3, payLater},
});

const in4 = (currency: string, min: number, max: number): Market => ({
  currency,
  min,
  max,
  plan: {kind: 'instalments', count: 4, payLater: false},
});

const later = (currency: string, min: number, max: number): Market => ({
  currency,
  min,
  max,
  plan: {kind: 'later'},
});

const MARKETS: Record<string, Market> = {
  AT: in3('EUR', 1, 5000),
  DE: in3('EUR', 1, 5000),
  FR: in3('EUR', 1, 3000),
  IE: in3('EUR', 1, 3000, false),
  IT: in3('EUR', 1, 3000),
  ES: in3('EUR', 1, 3000),
  NL: in3('EUR', 25, 5000),
  GR: in3('EUR', 1, 1000),
  PT: in3('EUR', 1, 1000),
  CH: in3('CHF', 1, 5000),
  CZ: in3('CZK', 25, 25000),
  DK: in3('DKK', 10, 50000),
  GB: in3('GBP', 1, 2000),
  NO: in3('NOK', 10, 75000),
  PL: in3('PLN', 5, 5000),
  RO: in3('RON', 5, 5000),
  US: in4('USD', 1, 2000),
  CA: in4('CAD', 1, 1500),
  AU: in4('AUD', 10, 2000),
  NZ: in4('NZD', 10, 2000),
  BE: later('EUR', 1, 1500),
  FI: later('EUR', 1, 3000),
  SE: later('SEK', 1, 100000),
};

/**
 * Used when the visitor's country is unknown (no Oxygen geo header: local
 * dev, some crawlers) or does not match the currency on screen — e.g. someone
 * in the US who switched to GBP. One representative market per currency; for
 * the euro, the tightest limits of the Pay-in-3 euro markets.
 */
const BY_CURRENCY: Record<string, Market> = {
  EUR: in3('EUR', 25, 1000),
  CHF: MARKETS.CH,
  CZK: MARKETS.CZ,
  DKK: MARKETS.DK,
  GBP: MARKETS.GB,
  NOK: MARKETS.NO,
  PLN: MARKETS.PL,
  RON: MARKETS.RO,
  USD: MARKETS.US,
  CAD: MARKETS.CA,
  AUD: MARKETS.AU,
  NZD: MARKETS.NZ,
  SEK: MARKETS.SE,
};

/**
 * The plan to advertise for this price, or `null` when Klarna has nothing for
 * the market or the amount is outside its limits — the line is then hidden.
 */
export function klarnaPlanFor(
  amount: number,
  currencyCode: string,
  buyerCountry?: string | null,
): KlarnaPlan | null {
  if (!(amount > 0)) return null;
  const byCountry = buyerCountry
    ? MARKETS[buyerCountry.toUpperCase()]
    : undefined;
  const market =
    byCountry && byCountry.currency === currencyCode
      ? byCountry
      : BY_CURRENCY[currencyCode];
  if (!market) return null;
  if (amount < market.min || amount > market.max) return null;
  return market.plan;
}
