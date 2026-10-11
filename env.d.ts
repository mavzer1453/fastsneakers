/// <reference types="vite/client" />
/// <reference types="react-router" />
/// <reference types="@shopify/oxygen-workers-types" />
/// <reference types="@shopify/hydrogen/react-router-types" />

// Enhance TypeScript's built-in typings.
import '@total-typescript/ts-reset';

declare global {
  interface Env extends HydrogenEnv {
    /** TikTok Pixel ID (Events Manager > Data sources). Public — sent to the browser. */
    PUBLIC_TIKTOK_PIXEL_ID: string;
    /** Meta Pixel / dataset ID (Meta Events Manager). Public — sent to the browser. */
    PUBLIC_META_PIXEL_ID: string;
    /**
     * GA4 Measurement ID, `G-XXXXXXXXXX` (Google Analytics → Admin → Data
     * streams → your web stream). Public — sent to the browser. Leave unset
     * and the GoogleAnalytics component renders nothing and loads no SDK.
     */
    PUBLIC_GA4_MEASUREMENT_ID?: string;
    /**
     * Google Ads tag ID, `AW-XXXXXXXXXX` (Google Ads → Goals → Google tag).
     * Public. Optional — root.tsx falls back to the live account's ID.
     */
    PUBLIC_GOOGLE_ADS_ID?: string;
    /**
     * Meta Conversions API access token (Events Manager → your pixel →
     * Settings → Conversions API → Generate access token).
     * Server-only SECRET — never prefix with PUBLIC_.
     */
    META_CAPI_ACCESS_TOKEN?: string;
    /**
     * Optional: test event code from Events Manager → Test events. When set,
     * server-side events show up in the Test events tab. Remove in production.
     */
    META_TEST_EVENT_CODE?: string;
    /**
     * Custom-app credentials (Shopify Dev Dashboard → Reprice → Credentials).
     * Used server-side for the Admin API client-credentials grant that feeds
     * the live-activity popup with real recent orders. Needs `read_orders`
     * and protected customer data access; without them the popup falls back
     * to the bestseller ranking. Never prefix with PUBLIC_.
     */
    SHOPIFY_CLIENT_ID?: string;
    SHOPIFY_CLIENT_SECRET?: string;
  }
}
