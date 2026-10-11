/**
 * Single source of truth for brand identity, contact details and the
 * commerce claims shown across the storefront (header, footer, homepage,
 * policies, contact and content pages).
 *
 * Fields marked PLACEHOLDER are intentionally `null`/empty: the UI renders
 * nothing for them until you fill in the real value, so the store never
 * shows fake data. The full pre-launch list lives in SHOPIFY_SETUP.md.
 */

export interface ContactChannel {
  /** Human-readable label, e.g. '+32 2 123 4567'. */
  display: string;
  /** Link target, e.g. 'tel:+3221234567' or 'https://wa.me/32471234567'. */
  href: string;
}

export interface SocialLink {
  label: string;
  href: string;
}

interface ShopConfig {
  name: string;
  /** Registered legal entity shown in the Terms of Service. */
  legalName: string;
  /** Owner named in the Legal notice (must match Shopify admin → Policies). */
  owner: string | null;
  tagline: string;
  /** Default meta description used when a page has no specific one. */
  defaultDescription: string;
  email: string;
  phone: ContactChannel | null;
  whatsapp: ContactChannel | null;
  /** Registered address lines, e.g. ['Rue Neuve 1', '1000 Brussels', 'Belgium']. */
  address: string[] | null;
  /** VAT number, e.g. 'BE0123456789'. */
  vatId: string | null;
  /** Company registration, e.g. 'KBO 0123.456.789'. */
  registrationId: string | null;
  socials: SocialLink[];
  supportHours: string;
  responseTime: string;
  freeShipping: {
    amount: number;
    currency: string;
    symbol: string;
    display: string;
  };
  shipsWithin: string;
  deliveryEstimate: string;
  returnDays: number;
  /** Fee charged when a pickup-point parcel is never collected (refund policy). */
  uncollectedFee: string;
  /**
   * Handling fee deducted from a change-of-mind refund on a United States or
   * Canada order (refund policy). Separate from `uncollectedFee`: this one is
   * charged on returns we accept, that one on parcels never picked up.
   */
  returnAdminFee: string;
  disclaimer: string;
  reviews: {
    score: string;
    count: number;
    customers: string;
    /**
     * Master switch for every rating / review / customer-count claim on the
     * storefront (ReviewBadge, the testimonial band, "1000+ satisfied
     * customers"). Keep `false` until the figures come from a review system
     * Google can verify (Judge.me, Trustpilot, Google Customer Reviews…).
     * Unverifiable ratings are a common Misrepresentation trigger.
     */
    show: boolean;
    /**
     * The customer-quote band ("Loved by our customers") on its own: real
     * messages from Instagram customers, shown without stars, a score or a
     * count. Independent of `show`, which still gates the rating figures.
     */
    showTestimonials: boolean;
  };
}

/**
 * Two-line brand lockup: "Fast" large with "Sneakers" smaller
 * underneath (header, footer, mobile menu).
 */
export const BRAND_LOCKUP = {top: 'Fast', sub: 'Sneakers'};

export const SHOP: ShopConfig = {
  name: 'Fast Sneakers',
  // Must read exactly as in Shopify admin → Policies and Merchant Center.
  legalName: 'Bozkurt Enterprise',
  owner: 'Ulku Mavzer',
  tagline: 'Curated streetwear, sneakers & essentials.',
  defaultDescription:
    'Curated streetwear, sneakers and accessories from the brands that matter — limited drops and everyday staples, with tracked worldwide shipping and 14-day returns.',
  email: 'support@fastsneaker.com', // PLACEHOLDER — set to the support inbox on the real domain once it is bought
  phone: null, // Removed on owner's request 2026-10-05 — contact is by email only.
  whatsapp: null, // PLACEHOLDER — {display: 'Chat on WhatsApp', href: 'https://wa.me/32471234567'}
  address: ['Brugsesteenweg 56', '8531 Harelbeke', 'Belgium'],
  // In Belgium the VAT number is the company (KBO) number with a BE prefix,
  // so the footer labels this one value "Company registration / VAT".
  vatId: 'BE 1012.722.956',
  registrationId: 'KBO 1012.722.956',
  socials: [], // PLACEHOLDER — [{label: 'Instagram', href: 'https://instagram.com/fastsneakers'}]
  supportHours: 'Mon–Fri, 09:00–17:00 (CET)',
  responseTime: 'We reply within 1–2 business days',
  // Shipping is free on EVERY order, worldwide — amount 0 means no
  // threshold (matches the Shopify delivery profile + app/lib/shipping.ts).
  freeShipping: {amount: 0, currency: 'EUR', symbol: '€', display: '€0'},
  shipsWithin: '1–3 business days',
  deliveryEstimate: '5–15 business days worldwide, tracked',
  returnDays: 14,
  uncollectedFee: '€15',
  returnAdminFee: '€15',
  disclaimer:
    'Every item is 100% authentic, sourced from trusted partners and checked before it ships.',

  /*
   * Social proof, in one place so the homepage ribbon, the social-proof band
   * and the product page can never quote different figures.
   *
   * These are claims made to shoppers: keep them true and be able to show
   * where they come from. Under the EU Omnibus rules a published rating has
   * to state its basis, and a merchant who cannot substantiate the number is
   * the one on the hook — so raise them only when the underlying reviews
   * actually move.
   */
  // Rating badge (4.8/5, 187 reviews) and "1000+" hidden 2026-09-28 for the
  // Merchant Center review, switched back on 2026-10-08: the owner confirmed
  // these are real figures (reviews from Instagram customers) he can back up.
  // Still no AggregateRating JSON-LD — see ReviewBadge.tsx.
  // Fast Sneakers is a new store: it has no reviews of its own yet, and the
  // 4.8 / 187 / 1000+ figures belonged to the original store. Both switches
  // stay off until this store has real, verifiable reviews of its own.
  reviews: {
    score: '0',
    count: 0,
    customers: '0',
    show: false,
    showTestimonials: false,
  },
};
