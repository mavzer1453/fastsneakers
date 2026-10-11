import {Analytics, getShopAnalytics, useNonce} from '@shopify/hydrogen';
import {isbot} from 'isbot';
import {
  Outlet,
  useRouteError,
  isRouteErrorResponse,
  type ShouldRevalidateFunction,
  Links,
  Meta,
  Scripts,
  ScrollRestoration,
  useMatches,
  useRouteLoaderData,
} from 'react-router';
import type {Route} from './+types/root';
import {HEADER_QUERY} from '~/lib/fragments';
import {getWishlistIds} from '~/lib/wishlist';
import {loadLiveActivity} from '~/lib/liveActivity.server';
import {SHOP} from '~/data/shop';
import zalandoSansLatin from '~/assets/fonts/zalando-sans-latin.woff2?url';
import zalandoSansLatinExt from '~/assets/fonts/zalando-sans-latin-ext.woff2?url';
import {isLikelyBot} from '~/lib/pixels';
import appStyles from '~/styles/app.css?url';
import tailwindCss from './styles/tailwind.css?inline';
import {PageLayout} from './components/PageLayout';
import {LanguageProvider} from '~/lib/useTranslate';
import {TikTokPixel} from './components/TikTokPixel';
import {MetaPixel} from './components/MetaPixel';
import {GoogleAnalytics} from './components/GoogleAnalytics';
import {loadMetaIdentity} from '~/lib/meta-identity.server';

export type RootLoader = typeof loader;

/**
 * This is important to avoid re-fetching root queries on sub-navigations
 */
export const shouldRevalidate: ShouldRevalidateFunction = ({
  formMethod,
  currentUrl,
  nextUrl,
}) => {
  // revalidate when a mutation is performed e.g add to cart, login...
  if (formMethod && formMethod !== 'GET') return true;

  // revalidate when manually revalidating via useRevalidator
  if (currentUrl.toString() === nextUrl.toString()) return true;

  // Defaulting to no revalidation for root loader data to improve performance.
  // When using this feature, you risk your UI getting out of sync with your server.
  // Use with caution. If you are uncomfortable with this optimization, update the
  // line below to `return defaultShouldRevalidate` instead.
  // For more details see: https://remix.run/docs/en/main/route/should-revalidate
  return false;
};

/**
 * The main and reset stylesheets are added in the Layout component
 * to prevent a bug in development HMR updates.
 *
 * This avoids the "failed to execute 'insertBefore' on 'Node'" error
 * that occurs after editing and navigating to another page.
 *
 * It's a temporary fix until the issue is resolved.
 * https://github.com/remix-run/remix/issues/9242
 */
export function links() {
  return [
    {
      rel: 'preconnect',
      href: 'https://cdn.shopify.com',
    },
    /*
     * Favicons are declared as real raster files, not a single SVG. iOS
     * Safari ignores SVG favicons entirely, and with nothing else on offer
     * it falls back to a generic icon — which is why the tab switcher was
     * showing a Shopify bag instead of the Fast Sneakers mark. The .ico carries
     * 16/32/48 renderings, and apple-touch-icon covers iOS home screens.
     * All of these live in public/ and are served from the site root.
     *
     * Every file is the Fast Sneakers mark (white bolt, orange speed lines)
     * on a charcoal tile. The 48 and 96px files are
     * there for Google specifically: it wants a favicon that is a multiple
     * of 48px and picks it up on its own schedule, days to a few weeks
     * after a change. favicon-96x96 is icon-512 scaled down.
     */
    {rel: 'icon', href: '/favicon.ico', sizes: 'any'},
    {rel: 'icon', type: 'image/png', sizes: '96x96', href: '/favicon-96x96.png'},
    {rel: 'icon', type: 'image/png', sizes: '48x48', href: '/favicon-48x48.png'},
    {rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png'},
    {rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png'},
    {rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png'},
    {rel: 'manifest', href: '/manifest.json'},
  ];
}

export const meta: Route.MetaFunction = () => {
  return [
    {title: `${SHOP.name} — Streetwear, Sneakers & Essentials`},
    {name: 'description', content: SHOP.defaultDescription},
    {name: 'theme-color', content: '#111111'},
    {property: 'og:site_name', content: SHOP.name},
    {property: 'og:type', content: 'website'},
    {name: 'twitter:card', content: 'summary'},
  ];
};

export async function loader(args: Route.LoaderArgs) {
  // Start fetching non-critical data without blocking time to first byte
  const deferredData = loadDeferredData(args);

  // Await the critical data required to render initial state of the page
  const criticalData = await loadCriticalData(args);

  const {storefront, env, customerAccount} = args.context;

  // Tokens for Shopify's <shopify-account> component, which signs customers
  // in without ever leaving the storefront. A signed-out visitor simply has
  // no token — that is the normal case, not an error, so a failed lookup is
  // treated the same as being signed out rather than breaking the page.
  let customerAccessToken: string | null = null;
  try {
    if (await customerAccount.isLoggedIn()) {
      customerAccessToken = (await customerAccount.getAccessToken()) ?? null;
    }
  } catch {
    customerAccessToken = null;
  }

  return {
    ...deferredData,
    ...criticalData,
    origin: new URL(args.request.url).origin,
    publicStoreDomain: env.PUBLIC_STORE_DOMAIN,
    publicAccessToken: env.PUBLIC_STOREFRONT_API_TOKEN,
    customerAccessToken,
    tiktokPixelId: env.PUBLIC_TIKTOK_PIXEL_ID,
    metaPixelId: env.PUBLIC_META_PIXEL_ID,
    ga4MeasurementId: env.PUBLIC_GA4_MEASUREMENT_ID,
    // Google Ads tag for this store's own Ads account. No fallback: an ID
    // here would send this shop's conversions to another account. Set
    // PUBLIC_GOOGLE_ADS_ID in Oxygen once the account exists.
    googleAdsId: env.PUBLIC_GOOGLE_ADS_ID,
    selectedLocale: storefront.i18n,
    shop: getShopAnalytics({
      storefront,
      publicStorefrontId: env.PUBLIC_STOREFRONT_ID,
    }),
    consent: {
      checkoutDomain: env.PUBLIC_CHECKOUT_DOMAIN,
      storefrontAccessToken: env.PUBLIC_STOREFRONT_API_TOKEN,
      // Re-enabled 2026-08-28. The previous `false` here was never actually a
      // rendering bug in Shopify's banner — `useCustomerPrivacy` only fetches
      // .../privacy-banner/storefront-banner.js (the script that draws the
      // banner) when this flag is true; at `false` it loads the bare
      // consent-tracking-api.js instead, which has no UI at all. So the old
      // comment's "banner never renders on this storefront" was really just
      // this flag being off — nothing ever asked it to render. CSP already
      // allows cdn.shopify.com in scriptSrc/connectSrc/styleSrc (added for
      // TikTok/Meta), which covers this script too, so no CSP change was
      // needed. This pulls the banner exactly as configured in Shopify admin
      // → Settings → Customer privacy → Cookie banner. Verify after deploy
      // that it actually renders for a fresh (no prior consent) visitor in a
      // covered region before trusting this — Claude could not render-test
      // this storefront directly, only trace the code path.
      withPrivacyBanner: true,
      // localize the privacy banner
      country: args.context.storefront.i18n.country,
      language: args.context.storefront.i18n.language,
    },
  };
}

/**
 * Load data necessary for rendering content above the fold. This is the critical data
 * needed to render the page. If it's unavailable, the whole page should 400 or 500 error.
 */
async function loadCriticalData({context}: Route.LoaderArgs) {
  const {storefront} = context;

  const [header] = await Promise.all([
    storefront.query(HEADER_QUERY, {
      cache: storefront.CacheLong(),
      variables: {
        headerMenuHandle: 'main-menu', // Adjust to your header menu handle
      },
    }),
    // Add other queries here, so that they are loaded in parallel
  ]);

  return {header};
}

/**
 * Load data for rendering content below the fold. This data is deferred and will be
 * fetched after the initial page load. If it's unavailable, the page should still 200.
 * Make sure to not throw any errors here, as it will cause the page to 500.
 */
function loadDeferredData({context, request}: Route.LoaderArgs) {
  const {customerAccount, cart, storefront} = context;
  const isCrawler = isbot(request.headers.get('user-agent'));

  return {
    cart: cartInLocaleCurrency(cart, storefront.i18n.country),
    isLoggedIn: customerAccount.isLoggedIn(),
    // Real recent orders (or, failing that, the real bestseller ranking)
    // for the live-activity popup. Streamed, cached and never rejecting —
    // an empty feed simply renders no popup.
    //
    // Not for crawlers. Its cache is a module-level Map, which a fresh worker
    // isolate starts without — so the first request to each one pays for an
    // Admin token exchange plus an orders query, one after the other. A
    // shopper never notices (it streams in late); a crawler waits for it,
    // because entry.server holds the whole response until `allReady`. That
    // was up to a second of every cold crawl spent on a popup Googlebot
    // cannot see.
    liveActivity: isCrawler
      ? Promise.resolve([])
      : loadLiveActivity({env: context.env, storefront}),
    // Streamed promise — never rejects (getWishlistIds swallows errors), so it
    // is safe to defer. Keeping it out of the critical path saves a Customer
    // Account API round-trip on every request for signed-in shoppers.
    favorites: getWishlistIds(customerAccount),
    // Streamed, never rejects. SHA-256 digests only — see
    // `~/lib/meta-identity.server` for why the raw address never gets here.
    metaIdentity: loadMetaIdentity(customerAccount),
  };
}

/**
 * Returns the cart, repointing it at the active locale's country first if the
 * two have drifted apart.
 *
 * New carts are seeded with the locale's country in `app/lib/context.ts`, but
 * a cart outlives that decision: carts created before the seed existed, and
 * carts carried across a locale switch, keep whatever country they were born
 * with. Shopify prices a cart from `buyerIdentity.countryCode`, so a stale one
 * shows up as a drawer total in the wrong currency next to correctly priced
 * products.
 *
 * The mutation only fires while the two actually disagree, so a cart that is
 * already in sync costs nothing extra. The re-read afterwards is deliberate:
 * cart mutations answer with the default mutate fragment, which is narrower
 * than `CART_QUERY_FRAGMENT`, and returning that thinner cart would blank
 * fields the drawer renders.
 */
async function cartInLocaleCurrency(
  cart: Route.LoaderArgs['context']['cart'],
  country: Route.LoaderArgs['context']['storefront']['i18n']['country'],
) {
  const current = await cart.get();

  if (!current || current.buyerIdentity?.countryCode === country) {
    return current;
  }

  try {
    const {errors} = await cart.updateBuyerIdentity({countryCode: country});
    if (errors?.length) return current;
    return (await cart.get()) ?? current;
  } catch {
    // A cart in the wrong currency is worth fixing, but never at the cost of
    // failing the request that renders the page around it.
    return current;
  }
}

/**
 * Routes whose first paint always needs the latin-ext font file (see the
 * preload below). Home and product pages render the customer reviews, some
 * of which are in Turkish — ş and ğ live in latin-ext.
 */
const LATIN_EXT_ROUTES = new Set([
  'routes/($locale)._index',
  'routes/($locale).products.$handle',
]);

export function Layout({children}: {children?: React.ReactNode}) {
  const nonce = useNonce();
  const data = useRouteLoaderData<RootLoader>('root');
  const lang = data?.selectedLocale?.language?.toLowerCase() ?? 'en';
  const matches = useMatches();
  // Turkish UI text uses ş/ğ/İ on every page; other languages only need the
  // file on the pages that print the reviews.
  const needsLatinExt =
    lang === 'tr' || matches.some((match) => LATIN_EXT_ROUTES.has(match.id));

  return (
    <html lang={lang}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        {/* Add this store's own Meta domain-verification <meta> here once
            the domain is verified in Meta Business Manager. */}
        {/*
          * Zalando Sans (Zalando's open-sourced brand face) and the hero's
          * Playfair Display italic, both self-hosted — see ~/styles/fonts.css
          * (pulled into app.css) for why they no longer come from Google Fonts. The latin file is
          * preloaded because every page sets its body text in it; without
          * the hint it is only discovered after the stylesheet has parsed.
          */}
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href={zalandoSansLatin}
          crossOrigin="anonymous"
        />
        {/*
          * The latin-ext subset is split off so most pages never download
          * it — but the ones that do need it only found out after app.css
          * had parsed, which put a 19 KB font at the end of the critical
          * chain (PageSpeed, 24 Sep 2026: CSS → font, 981 ms). Preloaded
          * only where the first paint is known to need it.
          */}
        {needsLatinExt ? (
          <link
            rel="preload"
            as="font"
            type="font/woff2"
            href={zalandoSansLatinExt}
            crossOrigin="anonymous"
          />
        ) : null}
        {/*
          * Tailwind's sheet (preflight + the few utilities in use, ~2.7 KB
          * gzipped) is written INTO the page instead of linked. As a second
          * render-blocking request it cost a round trip before first paint
          * for almost no bytes. It stays in this exact position — ahead of
          * app.css — so the cascade is unchanged.
          *
          * Only the server needs the text. In the browser the branch below
          * reads it back from the element React is about to hydrate, which
          * lets the bundler drop the CSS string from the JavaScript bundle
          * (`import.meta.env.SSR` is a build-time constant).
          */}
        <style
          id="tw"
          dangerouslySetInnerHTML={{
            __html: import.meta.env.SSR
              ? tailwindCss
              : (document.getElementById('tw')?.innerHTML ?? ''),
          }}
        />
        {/* Shopify's account component (account.js) is no longer loaded here.
            It pulls ~60 module files behind it, and as a <script> in the head
            all of them were fetched and run while the page was still trying
            to paint. PageLayout injects it once the page is quiet instead —
            see `useAccountComponent`. */}
        <link rel="stylesheet" href={appStyles}></link>
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
      </body>
    </html>
  );
}

export default function App() {
  const data = useRouteLoaderData<RootLoader>('root');

  if (!data) {
    return <Outlet />;
  }

  return (
    <Analytics.Provider
      cart={data.cart}
      shop={data.shop}
      consent={data.consent}
      canTrack={canTrackAnalytics}
    >
      <TikTokPixel pixelId={data.tiktokPixelId} />
      <MetaPixel pixelId={data.metaPixelId} identity={data.metaIdentity} />
      <GoogleAnalytics
        measurementId={data.ga4MeasurementId}
        adsId={data.googleAdsId}
      />
      <LanguageProvider>
        <PageLayout {...data}>
          <Outlet />
        </PageLayout>
      </LanguageProvider>
    </Analytics.Provider>
  );
}

/**
 * Hydrogen's default `canTrack` is just the Customer Privacy consent check.
 * This one also refuses crawlers and automation (Lighthouse, Meta's catalogue
 * fetchers, headless browsers — `isLikelyBot`): Shopify's analytics endpoint
 * rejects those user agents with a 400 anyway, which PageSpeed reports as
 * "browser errors were logged to the console", and every bot that got
 * through was a fake session in Live View. Real shoppers are unaffected — the
 * consent call is the same one Hydrogen makes.
 */
function canTrackAnalytics(): boolean {
  if (isLikelyBot()) return false;
  try {
    const shopify = (window as Window & {Shopify?: ShopifyGlobal}).Shopify;
    return shopify?.customerPrivacy?.analyticsProcessingAllowed?.() ?? false;
  } catch {
    return false;
  }
}

interface ShopifyGlobal {
  customerPrivacy?: {analyticsProcessingAllowed?: () => boolean};
}

export function ErrorBoundary() {
  const error = useRouteError();
  let errorStatus = 500;
  let heading = 'Something went wrong';
  let message =
    'An unexpected error occurred. Please try again in a moment — or contact us if the problem continues.';

  if (isRouteErrorResponse(error)) {
    errorStatus = error.status;
    if (errorStatus === 404) {
      heading = 'Page not found';
      message =
        "The page you're looking for doesn't exist or may have moved. Let's get you back on track.";
    }
  } else if (error instanceof Error) {
    // Log the real error for debugging, but never render it to shoppers.
    console.error(error);
  }

  return (
    <div className="route-error">
      <span className="route-error-status">{errorStatus}</span>
      <h1>{heading}</h1>
      <p>{message}</p>
      <div className="route-error-actions">
        <a className="btn btn-primary" href="/">
          Back to homepage
        </a>
        <a className="btn btn-ghost" href="/collections/all">
          Shop all products
        </a>
      </div>
    </div>
  );
}
