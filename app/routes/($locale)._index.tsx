import {Await, useLoaderData, Link} from 'react-router';
import type {Route} from './+types/($locale)._index';
import type {CSSProperties} from 'react';
import {Suspense} from 'react';
import type {
  HomePickFragment,
  ProductCardFragment,
} from 'storefrontapi.generated';
import {Emphasised} from '~/components/Emphasised';
import {ProductItem} from '~/components/ProductItem';
import {ProductsRail} from '~/components/ProductsRail';
import {useLocalizedHref} from '~/lib/localizedLink';
import {listingCache} from '~/lib/cache';
import {CustomerLove, InstaStrip} from '~/components/SocialProof';
import {useAside} from '~/components/Aside';
import {PromoStrip} from '~/components/PromoStrip';
import {isPromoLive} from '~/lib/promo';
import {HeroCollage, type HeroPrice} from '~/components/HeroCollage';
import {
  HERO_TILES,
  HERO_TILE_HANDLES,
  HERO_VIDEO_PRODUCT,
} from '~/data/heroTiles';
import {
  COLLAB_TILES,
  collabArtVars,
  collabHref,
  collabImage,
} from '~/data/collabs';
import {MENU_IMAGES} from '~/data/menuImages';
import {buildMeta} from '~/lib/seo';
import {
  PRODUCT_CARD_FRAGMENT,
  packCard,
  type PackedProductCard,
} from '~/lib/productCardFragment';
import {SHOP} from '~/data/shop';
import {useTranslate} from '~/lib/useTranslate';
import {TrustTicker} from '~/components/TrustBar';
import {BsHeadset, BsPatchCheck, BsTruck} from 'react-icons/bs';
import {
  FAQ_ENTRIES,
  HOME_FAQ_QUESTIONS,
  resolveTranslatedAnswer,
} from '~/data/faq';

export const meta: Route.MetaFunction = ({matches, location}) => {
  const rootData = matches.find((match) => match?.id === 'root')?.data as
    | {origin?: string}
    | undefined;
  const origin = rootData?.origin ?? '';

  const jsonLd = origin
    ? [
        {
          '@context': 'https://schema.org' as const,
          '@type': 'OnlineStore' as const,
          name: SHOP.name,
          legalName: SHOP.legalName,
          url: origin,
          email: SHOP.email,
          ...(SHOP.phone ? {telephone: SHOP.phone.href.replace('tel:', '')} : {}),
          ...(SHOP.vatId ? {vatID: SHOP.vatId.replace(/[\s.]/g, '')} : {}),
          ...(SHOP.address
            ? {
                address: {
                  '@type': 'PostalAddress' as const,
                  streetAddress: SHOP.address[0],
                  postalCode: '8531',
                  addressLocality: 'Harelbeke',
                  addressCountry: 'BE',
                },
              }
            : {}),
          hasMerchantReturnPolicy: {
            '@type': 'MerchantReturnPolicy' as const,
            applicableCountry: 'BE',
            returnPolicyCategory:
              'https://schema.org/MerchantReturnFiniteReturnWindow',
            merchantReturnDays: SHOP.returnDays,
            returnMethod: 'https://schema.org/ReturnByMail',
            // Customer books and pays the return shipping (no fixed fee, no label).
            returnFees: 'https://schema.org/ReturnFeesCustomerResponsibility',
            url: `${origin}/policies/refund-policy`,
          },
          ...(SHOP.socials.length > 0
            ? {sameAs: SHOP.socials.map((social) => social.href)}
            : {}),
        },
        {
          '@context': 'https://schema.org' as const,
          '@type': 'WebSite' as const,
          name: SHOP.name,
          url: origin,
          potentialAction: {
            '@type': 'SearchAction' as const,
            target: `${origin}/search?q={search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
        },
      ]
    : undefined;

  return buildMeta(
    {matches, pathname: location.pathname},
    {
      title: `${SHOP.name} — Streetwear, Sneakers & Essentials`,
      titleTemplate: '%s',
      description: `Curated streetwear and sneakers — limited drops and everyday staples, sourced from partners. Free shipping on every order, tracked delivery and ${SHOP.returnDays}-day returns.`,
      jsonLd: jsonLd as never,
    },
  );
};

export async function loader(args: Route.LoaderArgs) {
  // Start fetching non-critical data without blocking time to first byte
  const deferredData = loadDeferredData(args);

  // Await the critical data required to render initial state of the page
  const criticalData = await loadCriticalData(args);

  return {...deferredData, ...criticalData};
}

/**
 * Load data necessary for rendering content above the fold. This is the critical data
 * needed to render the page. If it's unavailable, the whole page should 400 or 500 error.
 */
async function loadCriticalData(_args: Route.LoaderArgs) {
  // The hero is fully static (lifestyle imagery + curated links), so the
  // homepage needs no blocking storefront query — instant TTFB.
  // `promoLive` lets the offer band reserve the dated slide's height in the
  // server HTML (see PromoStrip) — a boolean, so the response stays cacheable.
  return {promoLive: isPromoLive(Date.now())};
}

/**
 * Load data for rendering content below the fold. This data is deferred and will be
 * fetched after the initial page load. If it's unavailable, the page should still 200.
 * Make sure to not throw any errors here, as it will cause the page to 500.
 */
/**
 * The sneaker silhouettes and apparel labels currently carrying the resale
 * market. Order matters: index 0 leads the rail.
 *
 * Deliberately a list of MODELS, not of products — the catalogue holds
 * dozens of colourways per silhouette, and matching on the model name lets
 * whichever ones we actually have in stock float up.
 */
const HOT_SNEAKERS: RegExp[] = [
  /jordan\s*4/i,
  /travis scott/i,
  /jordan\s*1\s*low/i,
  /\bpanda\b/i,
  /sb dunk/i,
  /dunk low/i,
  /\bsamba\b/i,
  /gazelle/i,
  /campus/i,
  /air force 1/i,
  /air max plus|\btn\b/i,
  /vomero/i,
  /p-?6000/i,
  /9060/i,
  /2002r/i,
  /1906/i,
  /gel-?nyc/i,
  /gel-?kayano/i,
  /yeezy/i,
  /xt-?6/i,
];

/**
 * New Balance + ASICS get guaranteed slots in the Trending rail (every other
 * card). Ranked by the silhouettes moving right now; anything unmatched
 * keeps the brand collection's own best-selling order.
 */
const HOT_NB_ASICS: RegExp[] = [
  /9060/i,
  /1906/i,
  /gel-?nyc/i,
  /2002r/i,
  /gel-?1130/i,
  /\b204l\b/i,
  /gel-?kayano\s*14/i,
  /\b530\b/i,
  /gt-?2160/i,
  /\b740\b/i,
  /\b1000\b/i,
  /\b550\b/i,
];

const HOT_APPAREL: RegExp[] = [
  /essentials/i,
  /supreme/i,
  /sp5der|spider/i,
  /denim tears/i,
  /corteiz/i,
  /syna world/i,
  /st(u|ü)ssy/i,
  /hellstar/i,
  /tracksuit|full set/i,
  /hoodie/i,
];

function loadDeferredData({context}: Route.LoaderArgs) {
  // One combined pipeline so the sections can be DE-DUPLICATED against each
  // other — a product shown in "New arrivals" never repeats further down.
  const homeProducts = Promise.all([
    // One URL, the same for everyone in a market: every query on this page
    // is shared, so none of them should be rebuilt per visit. ~/lib/cache.
    context.storefront
      .query(NEW_ARRIVALS_QUERY, {cache: listingCache(context.storefront)})
      .catch(() => null),
    context.storefront
      .query(BESTSELLERS_LIGHT_QUERY, {
        cache: listingCache(context.storefront),
      })
      .catch(() => null),
    context.storefront
      .query(HOME_EXTRAS_QUERY, {cache: listingCache(context.storefront)})
      .catch(() => null),
    context.storefront
      .query(HERO_PRICES_QUERY, {
        cache: listingCache(context.storefront),
        // Written out rather than built in a loop: codegen types these six
        // as required named variables, and a Record<string, string> cannot
        // satisfy that shape.
        variables: {
          h0: HERO_TILE_HANDLES[0] ?? '',
          h1: HERO_TILE_HANDLES[1] ?? '',
          h2: HERO_TILE_HANDLES[2] ?? '',
          h3: HERO_TILE_HANDLES[3] ?? '',
          h4: HERO_TILE_HANDLES[4] ?? '',
          h5: HERO_TILE_HANDLES[5] ?? '',
        },
      })
      .catch(() => null),
  ])
    .then(async ([arrivalsData, bestsellersLight, extrasData, heroData]) => {
      const used = new Set<string>();
      // Collection products, or the fallback search when the collection
      // does not exist (yet) or is empty.
      const pick = <T,>(
        collection: {products: {nodes: T[]}} | null | undefined,
        fallback: {nodes: T[]} | null | undefined,
      ): T[] =>
        collection?.products.nodes.length
          ? collection.products.nodes
          : (fallback?.nodes ?? []);
      const take = (
        items: HomePickFragment[],
        count: number,
      ): HomePickFragment[] => {
        const out: HomePickFragment[] = [];
        for (const item of items) {
          if (out.length >= count) break;
          if (used.has(item.id)) continue;
          if (Number(item.priceRange?.minVariantPrice?.amount ?? 0) <= 0)
            continue;
          used.add(item.id);
          out.push(item);
        }
        return out;
      };

      // The 2002R Sandstone is pinned to Trending sneakers; claim it before
      // any other rail (Deals of the week) can take it.
      const pinnedTrending = take(
        extrasData?.sandstone ? [extrasData.sandstone] : [],
        1,
      );

      // Products people actually searched for in our Google Shopping ads
      // (tagged `searched` in Shopify — retag weekly from Google Ads →
      // Insights → Search terms). They lead Trending sneakers and Staff
      // picks, and claim their slots before any other rail can take them.
      // Sneakers alternate into Trending; the rest (apparel included) go to
      // Staff picks.
      const searchedPool = extrasData?.searched?.nodes ?? [];
      const isApparel = (item: HomePickFragment) =>
        /hoodie|tee\b|t-shirt|shirt|jacket|pants?\b|shorts|tracksuit|\bsets?\b/i.test(
          item.title,
        );
      const searchedTrending = take(
        searchedPool.filter((item) => !isApparel(item)).filter((_, i) => i % 2 === 0),
        5,
      );
      const searchedStaff = take(searchedPool, 5);

      // Curated blocks pick FIRST so their hero pieces can't be swallowed
      // by the generic rails higher up the page.
      //
      // Deals of the week — hand-mixed, not just the top of the sale list:
      // an Essentials set leads, a black/white Air Max 1 beside it, some
      // multicolour statements, and sale bestsellers fill the rest.
      const essentialsPool = extrasData?.essentials?.nodes ?? [];
      const airmaxPool = extrasData?.airmax?.nodes ?? [];
      const multicolorPool = extrasData?.multicolor?.nodes ?? [];
      const essentialsSet = essentialsPool.filter((item) =>
        /\bsets?\b|full set|tracksuit/i.test(item.title),
      );
      const airmax1BW = airmaxPool.filter(
        (item) =>
          /air max 1\b/i.test(item.title) &&
          /white|black/i.test(item.title),
      );
      const deals = take(
        [
          ...essentialsSet.slice(0, 1),
          ...airmax1BW.slice(0, 1),
          ...multicolorPool.slice(0, 2),
          ...(pick(extrasData?.sale, extrasData?.fbSale)),
        ],
        12,
      );

      // "The pieces everyone's after" shows ONLY the real, researched
      // market bestsellers (the products carrying a `bs:NNN` rank tag) —
      // never generic filler. The top of the ranking is shuffled with an
      // hourly seed so the rail rotates through the bestseller pool over
      // time while staying stable within a visit (and across hydration).
      // It picks BEFORE New arrivals because it renders first on the page.
      const rankOf = (node: {tags?: string[] | null}) =>
        (node.tags ?? []).find((tag) => tag.startsWith('bs:')) ?? 'bs:999';
      const rankedBestsellers = [...(bestsellersLight?.products?.nodes ?? [])]
        .sort((a, b) => {
          const left = rankOf(a);
          const right = rankOf(b);
          return left < right ? -1 : left > right ? 1 : 0;
        })
        .slice(0, 40);
      const best = [
        ...searchedStaff,
        ...take(
          rankedBestsellers.length
            ? seededShuffle(
                rankedBestsellers,
                Math.floor(Date.now() / 3_600_000),
              ).slice(0, 24)
            : // No `bestseller`-tagged products yet: fall back to the
              // store's own best-selling order.
              (extrasData?.fbTop?.nodes ?? []),
          12 - searchedStaff.length,
        ),
      ];

      /*
       * Trending sneakers / Featured apparel — the same split StockX runs.
       *
       * Ordered by the models that are actually moving right now, then
       * topped up from the collection's own BEST_SELLING order. The hot
       * list is matched against OUR catalogue rather than copied from a
       * marketplace: a rail of models we don't stock is a row of dead ends,
       * and their prices aren't ours either. Sort is stable, so anything
       * that matches nothing keeps the store's own bestseller order.
       */
      const rankBy = (
        items: HomePickFragment[],
        patterns: RegExp[],
      ): HomePickFragment[] => {
        const score = (item: HomePickFragment) => {
          const index = patterns.findIndex((pattern) =>
            pattern.test(item.title),
          );
          return index === -1 ? patterns.length : index;
        };
        return [...items].sort((a, b) => score(a) - score(b));
      };
      /*
       * Keep the rails varied. The catalogue carries a separate product per
       * colourway, so straight best-selling order filled twelve slots with
       * five Supreme box logos and eight Tyler The Creator tees — a rail
       * that reads as a bug rather than a curation.
       *
       * At most two per style, keyed on the first three words of the title.
       * That is enough to separate "Nike Air Jordan" from "Yeezy Boost"
       * while collapsing the colour that always trails the name.
       *
       * No per-BRAND cap: `vendor` is not filled in consistently across the
       * catalogue, so capping on it emptied the rails instead of balancing
       * them (the apparel rail came out with a single card).
       */
      const variety = (
        items: HomePickFragment[],
      ): HomePickFragment[] => {
        const perStyle = new Map<string, number>();
        return items.filter((item) => {
          const style = item.title
            .toLowerCase()
            .split(/\s+/)
            .slice(0, 3)
            .join(' ');
          const seen = perStyle.get(style) ?? 0;
          if (seen >= 2) return false;
          perStyle.set(style, seen + 1);
          return true;
        });
      };
      // Alternate two ranked lists: a[0], b[0], a[1], b[1], …
      const alternate = <T,>(a: T[], b: T[]): T[] => {
        const out: T[] = [];
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
          if (i < a.length) out.push(a[i]);
          if (i < b.length) out.push(b[i]);
        }
        return out;
      };
      // Half the rail is New Balance / ASICS (alternating brands), the other
      // half the general hot list; the two halves are interleaved.
      const nbAsics = [
        // Pinned: always the first New Balance card in the rail.
        ...pinnedTrending,
        ...take(
          // ASICS leads the alternation so the brands stay 3 + 3 after the pin.
          alternate(
            variety(
              rankBy(pick(extrasData?.asics, extrasData?.fbAsics), HOT_NB_ASICS),
            ),
            variety(
              rankBy(pick(extrasData?.newbalance, extrasData?.fbNewBalance), HOT_NB_ASICS),
            ),
          ),
          6 - pinnedTrending.length,
        ),
      ];
      // Three guaranteed Travis Scott pairs (collection best-selling order).
      const travis = take(
        variety(pick(extrasData?.travisscott, extrasData?.fbTravis)),
        3,
      );
      const others = take(
        variety(
          rankBy(pick(extrasData?.trending, extrasData?.fbSneakers), HOT_SNEAKERS),
        ),
        Math.max(0, 12 - nbAsics.length - travis.length - searchedTrending.length),
      );
      // Rail: Travis Scott / hot list on one side, NB + ASICS on the other.
      const trending = [
        ...searchedTrending,
        ...alternate(alternate(travis, others), nbAsics),
      ];
      const apparel = take(
        variety(rankBy(pick(extrasData?.apparel, extrasData?.fbApparel), HOT_APPAREL)),
        12,
      );

      // Brand spotlight: hero pieces from the Essentials wardrobe. Desktop
      // shows three across; phones show the first two. These three are
      // hand-picked (the catalog holds near-duplicate colourways, so the
      // generic "best selling set" pick can't be trusted to choose the
      // right one); anything missing falls back to the generic order.
      const SPOTLIGHT_HANDLES = [
        'essentials-hoodie-set',
        'essentials-1977-tracksuit-1',
        'essentials-1977-tracksuit',
      ];
      const byHandle = new Map(
        [...essentialsSet, ...essentialsPool].map((item) => [
          item.handle,
          item,
        ]),
      );
      const spotlight = take(
        [
          ...SPOTLIGHT_HANDLES.map((handle) => byHandle.get(handle)).filter(
            (item): item is HomePickFragment => Boolean(item),
          ),
          ...essentialsSet,
          ...essentialsPool,
        ],
        3,
      );

      // Her side / his side: the bestselling pieces from the Women and Men
      // collections that aren't already starring in a rail above.
      const her = take(pick(extrasData?.forher, extrasData?.fbWomen), 2);
      const him = take(pick(extrasData?.forhim, extrasData?.fbMen), 2);

      const arrivals = take(
        interleaveBuckets(
          [
            arrivalsData?.sneakers.nodes,
            arrivalsData?.tops.nodes,
            arrivalsData?.sets.nodes,
            arrivalsData?.bottoms.nodes,
          ],
          24,
        ),
        12,
      );

      const under100 = take(extrasData?.under?.nodes ?? [], 10);

      /*
       * Prices for the hero collage tiles, keyed by tile id.
       *
       * The tiles themselves are hand-picked photography (see
       * `app/data/heroTiles.ts`) — this only looks up what each one costs, so
       * the banner can show a price next to the shot. A tile whose product
       * has been renamed or delisted simply loses its price rather than
       * breaking the banner, and a tile that points at a collection never had
       * one to begin with.
       */
      const heroPrices: Record<string, HeroPrice> = {};
      const byHeroHandle = new Map(
        [
          heroData?.p0,
          heroData?.p1,
          heroData?.p2,
          heroData?.p3,
          heroData?.p4,
          heroData?.p5,
        ]
          .filter((node) => Boolean(node))
          .map((node) => [node!.handle, node!.priceRange?.minVariantPrice]),
      );
      const floor = (
        node?: {
          products: {
            nodes: Array<{priceRange: {minVariantPrice: HeroPrice}}>;
          };
        } | null,
      ) => node?.products?.nodes?.[0]?.priceRange?.minVariantPrice;
      const collectionFloor: Record<string, HeroPrice | undefined> = {
        essentials: floor(heroData?.heroEssentials),
        jacquemus: floor(heroData?.heroJacquemus),
        stussy: floor(heroData?.heroStussy),
        'ugg-boots-slippers': floor(heroData?.heroUgg),
      };
      for (const tile of HERO_TILES) {
        const price = tile.handle
          ? byHeroHandle.get(tile.handle)
          : tile.collection
            ? collectionFloor[tile.collection]
            : undefined;
        if (price) heroPrices[tile.id] = price;
      }
      const clipPrice = byHeroHandle.get(HERO_VIDEO_PRODUCT.handle);
      if (clipPrice) heroPrices[HERO_VIDEO_PRODUCT.id] = clipPrice;

      /*
       * Everything above chose its products from LIGHT nodes — id, title and
       * a price, nothing else. Only now are the ~75 winners fetched as full
       * cards.
       *
       * It used to be the other way round: all ~390 candidates came back as
       * full cards (24 variants and 5 images apiece, so roughly 9,000
       * variants) just to keep twelve per rail. On a cold cache that one
       * query took 5-6 seconds, which is what pushed the stream past its
       * timeout and what every crawler sat waiting on.
       *
       * Two requests, so the hourly bestseller shuffle only invalidates its
       * own small entry and the rest stays cached.
       */
      const stablePicks = [
        ...deals,
        ...trending,
        ...apparel,
        ...spotlight,
        ...her,
        ...him,
        ...arrivals,
        ...under100,
      ];
      const fetchCards = async (picks: HomePickFragment[]) => {
        if (picks.length === 0) return [];
        const {nodes} = await context.storefront.query(
          HOME_PRODUCTS_BY_IDS_QUERY,
          {
            variables: {ids: picks.map((pick) => pick.id)},
            cache: listingCache(context.storefront),
          },
        );
        return ((nodes ?? []).filter(Boolean) as ProductCardFragment[]).map(
          (card) => packCard(card),
        );
      };
      const [bestCards, stableCards] = await Promise.all([
        fetchCards(best).catch(() => [] as PackedProductCard[]),
        fetchCards(stablePicks).catch(() => [] as PackedProductCard[]),
      ]);
      const cardById = new Map(
        [...bestCards, ...stableCards].map((card) => [card.id, card]),
      );
      const fill = (picks: HomePickFragment[]): PackedProductCard[] =>
        picks
          .map((pick) => cardById.get(pick.id))
          .filter((card): card is PackedProductCard => Boolean(card));

      return {
        arrivals: fill(arrivals),
        deals: fill(deals),
        best: fill(best),
        heroPrices,
        trending: fill(trending),
        apparel: fill(apparel),
        under100: fill(under100),
        her: fill(her),
        him: fill(him),
        spotlight: fill(spotlight),
      };
    })
    .catch((error: Error) => {
      console.error(error);
      return {
        arrivals: [],
        deals: [],
        best: [],
        heroPrices: {},
        trending: [],
        apparel: [],
        under100: [],
        her: [],
        him: [],
        spotlight: [],
      };
    });

  return {
    homeProducts,
  };
}

/**
 * Deterministic Fisher–Yates: the same seed always yields the same order,
 * so SSR, hydration and CDN-cached responses agree — while a new seed
 * (every hour) rotates which bestsellers lead the rail.
 */
function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let state = seed >>> 0 || 1;
  const next = () => {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

type HomeProducts = ReturnType<typeof loadDeferredData>['homeProducts'];

export default function Homepage() {
  const data = useLoaderData<typeof loader>();
  return (
    <div className="home">
      {/* Sales-first order: banner → category routes → proven bestsellers
          → price urgency (deals) → freshness → budget row → brand story →
          trust layer. Money pages up top, reassurance below. */}
      <PromoStrip reserveDated={data.promoLive} />
      <Suspense fallback={<HeroCollage prices={{}} />}>
        <Await
          resolve={data.homeProducts}
          errorElement={<HeroCollage prices={{}} />}
        >
          {({heroPrices}) => <HeroCollage prices={heroPrices} />}
        </Await>
      </Suspense>
      <PopularBrands />
      <TrustTicker />
      <RecommendedProducts products={data.homeProducts} />
      <Collabs />
      <TrendingSneakers products={data.homeProducts} />
      <FeaturedApparel products={data.homeProducts} />
      <FeaturedDeals products={data.homeProducts} />
      <HerHim products={data.homeProducts} />
      <NewArrivals products={data.homeProducts} />
      <BrandSpotlight products={data.homeProducts} />
      {/* Social proof lands mid-page, while shoppers are still browsing —
          not buried at the bottom after they've decided. */}
      <CustomerLove />
      <UnderHundred products={data.homeProducts} />
      <InstaStrip />
      <BrandMarquee />
      <HelpAndPromise />
    </div>
  );
}

/**
 * Full-bleed cinematic hero (Zalando/MERA-style): lifestyle photography
 * with a dusk gradient overlay, bold statement and audience quick-links.
 */
/** Transparent product cutouts served from the store's own CDN. */
const CDN = 'https://cdn.shopify.com/s/files/1/1024/9466/7139/files';

/**
 * `fetchpriority` is valid HTML but React only types the camelCase
 * `fetchPriority` prop from v19 on; React 18 forwards unknown lowercase
 * attributes to the DOM untouched. Spreading it as a plain string record
 * keeps the working spelling without fighting the types or the linter.
 */
const HIGH_FETCH_PRIORITY: Record<string, string> = {fetchpriority: 'high'};

/**
 * What a rail renders when its deferred data never arrives: nothing.
 *
 * It has to be a real element. React Router treats a falsy errorElement
 * (`null`) as "none given" and rethrows, which hands the rejection to the
 * root ErrorBoundary and swaps the entire page for "Something went wrong".
 * An empty fragment is truthy, so the rail just stays out of the page.
 */
const AWAIT_FAILED = <></>;




/**
 * Round-robin merge of the per-category buckets so the rail alternates
 * sneakers → clothing → sets → more, deduped, capped at 8.
 */
function interleaveBuckets<T extends {id: string}>(
  buckets: Array<Array<T> | undefined>,
  limit = 8,
): T[] {
  const merged: T[] = [];
  const seen = new Set<string>();
  const max = Math.max(0, ...buckets.map((bucket) => bucket?.length ?? 0));
  for (let index = 0; index < max && merged.length < limit; index++) {
    for (const bucket of buckets) {
      const product = bucket?.[index];
      if (!product || seen.has(product.id)) continue;
      seen.add(product.id);
      merged.push(product);
      if (merged.length >= limit) break;
    }
  }
  return merged;
}

/**
 * Minimal section header: one bold title (with the brand-red full stop)
 * on the left, "View all →" pinned to the right. No eyebrows, no
 * descriptions — nothing between the shopper and the products.
 */
/**
 * Popular brands — the first thing under the hero, where "Shop by category"
 * used to be. Eight tiles in rows of four (two rows on a phone). The eight
 * doors AND the product on each tile are the owner's pick (his reference
 * screenshot, 2026-09-21): every tile shows one real product from the
 * collection it opens — the Travis Scott tile wears a Travis Scott Jordan and
 * lands on the Travis Scott sneakers shelf, and so on. (The eighth tile was
 * Accessories in the screenshot; he replaced it with Stussy the same day.)
 *
 * The photos are named here rather than read from `MENU_IMAGES`: the menu
 * needs every picture to be unique across ~300 tiles, and its choice for a
 * brand is not always the product the owner wants on the homepage. Each file
 * is that product's featured image on the store CDN (transparent or white
 * background, so it sinks into the tinted tile under `multiply`).
 *
 * The name sits UNDER the tile, not on it — four-up on a phone a tile is
 * ~80px wide and a label laid over the photo would cover the product.
 *
 * The bar underneath does NOT go to a brands page — there isn't one worth
 * sending anyone to. The real index is the menu, which holds every brand,
 * model and category with its own drill-down, so the bar opens the drawer
 * instead of dead-ending on a thin listing page.
 */
const POPULAR_BRANDS: Array<{
  label: string;
  handle: string;
  /** Featured image of the product shown on the tile (file on the CDN). */
  image: string;
  /** Run the label through the dictionary (a category, not a brand name). */
  translate?: boolean;
}> = [
  {
    // Fear of God Essentials NBA Black White Summer Set
    label: 'FOG Essentials',
    handle: 'essentials',
    image: 'FearofGodEssentialsNBABlackWhiteSummerSet.png?v=1786137006',
  },
  {
    // Jacquemus Le Grand Bambino Navy
    label: 'Jacquemus',
    handle: 'jacquemus',
    image: 'JacquemusLeGrandBambinoNavy.png?v=1786123460',
  },
  {
    // ASICS Gel-Kayano 14 Arctic Sky Pure Silver
    label: 'ASICS',
    handle: 'asics',
    image: 'ASICSGelKayano14ArcticSkyPureSilver.png?v=1786160709',
  },
  {
    // New Balance 9060 Navy Oxford Blue
    label: 'New Balance',
    handle: 'new-balance',
    image: 'U906023D-main.webp?v=1788260639',
  },
  {
    // Nike Air Jordan 1 Retro Low OG SP Travis Scott Sail Tropical Pink
    // The sneakers shelf, not /collections/travis-scott: the owner wants this
    // tile to open adult pairs only — no apparel, no kids sizes, no laces.
    label: 'Travis Scott',
    handle: 'travis-scott-sneakers',
    image:
      'Nike_Air_Jordan_1_Retro_Low_OG_SP_Travis_Scott_Sail_Tropical_Pink.png?v=1786123441',
  },
  {
    // adidas Handball Spezial Shadow Red Cream White
    label: 'adidas',
    handle: 'adidas',
    image: 'KI8686-main.png?v=1788259696',
  },
  {
    // On Running Cloudtilt Glacier Ice
    label: 'On Running',
    handle: 'on-running',
    image: 'onrunningglacierice.png?v=1786123493',
  },
  {
    // Stussy T-shirt Iced Out. (This slot was Accessories in the reference;
    // the owner swapped it — that shelf is mostly Jacquemus bags.)
    label: 'Stussy',
    handle: 'stussy',
    image: 'stussy-t-shirt-iced-out-2271983.png?v=1786149373',
  },
];

/** Renditions the image CDN is asked for; see the <img> below. */
const BRAND_TILE_WIDTHS = [96, 160, 240, 320];

function PopularBrands() {
  const localize = useLocalizedHref();
  const t = useTranslate();
  const {open} = useAside();
  return (
    <section className="section brand-tiles" aria-labelledby="popular-brands">
      <div className="section-head-row">
        <h2 id="popular-brands">
          {t('Popular brands')}
          <span className="section-title-dot" aria-hidden="true">
            .
          </span>
        </h2>
      </div>
      <ul className="brand-grid">
        {POPULAR_BRANDS.map((brand) => (
          <li key={brand.handle}>
            <Link
              to={localize(`/collections/${brand.handle}`)}
              className="brand-tile"
              prefetch="intent"
            >
              <span className="brand-tile-media">
                <img
                  className="brand-tile-img"
                  /*
                   * The photo is drawn ~66px wide on a phone and ~150px at
                   * most on a desktop. One 320px file for all of them was 5-7x
                   * the pixels a phone needs (PageSpeed: ~85% of each file
                   * wasted), so the browser now picks from four widths.
                   */
                  src={`${CDN}/${brand.image}&width=160`}
                  srcSet={BRAND_TILE_WIDTHS.map(
                    (width) => `${CDN}/${brand.image}&width=${width} ${width}w`,
                  ).join(', ')}
                  sizes="(min-width: 64em) 10vw, (min-width: 48em) 18vw, 17vw"
                  width={320}
                  height={320}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              </span>
              <span className="brand-tile-name">
                {brand.translate ? t(brand.label) : brand.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="brand-bar reset"
        onClick={() => open('mobile')}
      >
        <span className="brand-bar-icon" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </span>
        <span className="brand-bar-label">{t('Shop all brands')}</span>
        <span className="brand-bar-arrow" aria-hidden="true">
          →
        </span>
      </button>
    </section>
  );
}

/**
 * Two rails in the shape StockX uses on its homepage: the sneakers people
 * are chasing, then the apparel. Both come out of our own catalogue, ranked
 * by the hot-model lists at the top of this file and de-duplicated against
 * every rail above them, so nothing appears twice on the page.
 */
function TrendingSneakers({products}: {products: HomeProducts}) {
  const t = useTranslate();
  return (
    <section className="section" aria-labelledby="trending-sneakers">
      <SectionHead
        title="Trending sneakers"
        id="trending-sneakers"
        to="/collections/sneakers"
        linkLabel="See all"
      />
      <Suspense
        fallback={<div className="products-loading">{t('Loading…')}</div>}
      >
        <Await resolve={products} errorElement={AWAIT_FAILED}>
          {({trending}) =>
            trending.length === 0 ? null : (
              <ProductsRail>
                {trending.map((product) => (
                  <div className="products-carousel-item" key={product.id}>
                    <ProductItem product={product} />
                  </div>
                ))}
              </ProductsRail>
            )
          }
        </Await>
      </Suspense>
    </section>
  );
}

function FeaturedApparel({products}: {products: HomeProducts}) {
  const t = useTranslate();
  return (
    <section className="section" aria-labelledby="featured-apparel">
      <SectionHead
        title="Featured apparel"
        id="featured-apparel"
        to="/collections/clothing"
        linkLabel="See all"
      />
      <Suspense
        fallback={<div className="products-loading">{t('Loading…')}</div>}
      >
        <Await resolve={products} errorElement={AWAIT_FAILED}>
          {({apparel}) =>
            apparel.length === 0 ? null : (
              <ProductsRail>
                {apparel.map((product) => (
                  <div className="products-carousel-item" key={product.id}>
                    <ProductItem product={product} />
                  </div>
                ))}
              </ProductsRail>
            )
          }
        </Await>
      </Suspense>
    </section>
  );
}

/**
 * Collabs, directly under Popular brands.
 *
 * Wide 3:2 cards rather than the square brand tiles above: the two rows sit
 * next to each other, and if they shared a shape the page would read as one
 * long strip of logos. Darker, bigger, one line of type — a collab is an
 * event, a brand is a filter.
 *
 * Every tile opens its collection with the adult size filter applied (see
 * `collabHref`), because these collections carry the PS and TD pairs too and
 * unfiltered they open on a wall of toddler shoes.
 */
function Collabs() {
  const localize = useLocalizedHref();
  const t = useTranslate();
  return (
    <section className="section collab-band" aria-labelledby="collabs">
      <div className="section-head-row">
        <h2 id="collabs">
          {t('Collabs')}
          <span className="section-title-dot" aria-hidden="true">
            .
          </span>
        </h2>
        <Link
          className="section-head-link"
          to={localize('/collections/collabs')}
          prefetch="intent"
        >
          {t('See all')}
          <span className="section-head-link-arrow" aria-hidden="true">
            →
          </span>
        </Link>
      </div>

      <div className="collab-rail">
        {COLLAB_TILES.map((collab) => (
          <Link
            key={collab.handle}
            to={localize(collabHref(collab.handle))}
            className="collab-card"
            prefetch="intent"
          >
            {MENU_IMAGES[collab.handle] ? (
              <img
                className="collab-card-img"
                src={collabImage(MENU_IMAGES[collab.handle], 240)}
                /* Drawn at 60% of the card's height, i.e. 0.4x its width:
                   ~100px on a phone, ~170px at most on a desktop. */
                srcSet={[160, 240, 320, 480]
                  .map(
                    (width) =>
                      `${collabImage(MENU_IMAGES[collab.handle], width)} ${width}w`,
                  )
                  .join(', ')}
                sizes="(min-width: 48em) 10vw, (min-width: 30em) 14vw, 27vw"
                /* The cut-outs are square; the attributes only give the
                   browser a ratio before the file arrives — CSS sets the
                   drawn size. */
                width={320}
                height={320}
                decoding="async"
                /*
                 * Per-image scale + nudge so every shoe is drawn the same
                 * height, whatever the supplier's framing. See collabArtVars.
                 */
                style={collabArtVars(collab.handle) as CSSProperties}
                alt=""
                loading="lazy"
              />
            ) : null}
            <span className="collab-card-shade" aria-hidden="true" />
            <span className="collab-card-name">{collab.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function SectionHead({
  title,
  id,
  to,
  linkLabel,
}: {
  title: string;
  id: string;
  to: string;
  linkLabel: string;
}) {
  const localize = useLocalizedHref();
  const t = useTranslate();
  return (
    <div className="section-head-row">
      <h2 id={id}>
        {t(title)}
        <span className="section-title-dot" aria-hidden="true">
          .
        </span>
      </h2>
      <Link
        className="section-head-link"
        to={localize(to)}
        prefetch="intent"
      >
        {t(linkLabel)}
        <span className="section-head-link-arrow" aria-hidden="true">
          →
        </span>
      </Link>
    </div>
  );
}

function NewArrivals({products}: {products: HomeProducts}) {
  const t = useTranslate();
  return (
    <section className="section new-arrivals" aria-labelledby="new-arrivals">
      <SectionHead
        title="New arrivals"
        id="new-arrivals"
        to="/collections/all?sort_by=newest"
        linkLabel="View all"
      />
      <Suspense
        fallback={<div className="products-loading">{t('Loading…')}</div>}
      >
        <Await resolve={products} errorElement={AWAIT_FAILED}>
          {({arrivals}) => (
            <ProductsRail>
              {arrivals.map((product) => (
                <div className="products-carousel-item" key={product.id}>
                  <ProductItem product={product} />
                </div>
              ))}
            </ProductsRail>
          )}
        </Await>
      </Suspense>
    </section>
  );
}

/**
 * "Deals of the week" as an editorial feature grid: the best deal renders
 * as a large lead card with four more flanking it — a deliberate break
 * from the rails around it. Capped in width so the lead card stays a
 * feature instead of a wall of image.
 */
function FeaturedDeals({products}: {products: HomeProducts}) {
  return (
    <Suspense fallback={null}>
      <Await resolve={products} errorElement={AWAIT_FAILED}>
        {({deals}) => {
          if (deals.length < 3) return null;
          return (
            <section className="section" aria-labelledby="deals-week">
              <SectionHead
                title="Deals of the week"
                id="deals-week"
                to="/collections/sale"
                linkLabel="Shop all deals"
              />
              <div className="feature-grid">
                {deals.slice(0, 5).map((product, index) => (
                  <div
                    className={`feature-grid-item${index === 0 ? ' is-lead' : ''}`}
                    key={product.id}
                  >
                    <ProductItem
                      product={product}
                      loading={index === 0 ? 'eager' : undefined}
                    />
                  </div>
                ))}
              </div>
            </section>
          );
        }}
      </Await>
    </Suspense>
  );
}

/**
 * Brand spotlight: lifestyle image with the brand name overlaid, an
 * editorial line, a pill CTA, then two oversized product cards.
 */
function BrandSpotlight({products}: {products: HomeProducts}) {
  const localize = useLocalizedHref();
  const t = useTranslate();
  return (
    <Suspense fallback={null}>
      <Await resolve={products} errorElement={AWAIT_FAILED}>
        {({spotlight}) => {
          if (spotlight.length < 2) return null;
          return (
            <section className="section spotlight" aria-labelledby="spotlight-h">
              <div className="spotlight-media">
                <img src="/spotlight-essentials.jpg" alt="" loading="lazy" />
                <span className="spotlight-media-brand">Essentials</span>
              </div>
              <div className="spotlight-copy">
                <h2 id="spotlight-h">
                  Fear of God Essentials
                  <br />
                  {t('Sets that carry the season')}
                </h2>
                <p>
                  {t(
                    'Matching heavyweight sets and staples in muted tones — the quiet uniform of the collective.',
                  )}
                </p>
                <Link
                  to={localize('/collections/essentials')}
                  className="btn spotlight-cta"
                >
                  {t('Shop the Essentials edit')}
                  <span aria-hidden="true"> →</span>
                </Link>
              </div>
              <div className="spotlight-products">
                {spotlight.map((product) => (
                  <ProductItem key={product.id} product={product} />
                ))}
              </div>
            </section>
          );
        }}
      </Await>
    </Suspense>
  );
}

/**
 * Her side / his side: Zalando-style mixed collage — each half pairs a
 * real customer photo with two bestselling product cards from that
 * collection. Photo sells the vibe, cards close the sale.
 */
const HERHIM_SIDES = [
  {
    key: 'her' as const,
    img: '/customers/look-women.jpg',
    label: 'Shop women',
    to: '/collections/women',
    // Bottom-anchored: whatever gets cropped, the footwear stays.
    pos: 'center bottom',
  },
  {
    key: 'him' as const,
    img: '/customers/look-men.jpg',
    label: 'Shop men',
    to: '/collections/men',
    pos: 'center bottom',
  },
];

function HerHim({products}: {products: HomeProducts}) {
  const localize = useLocalizedHref();
  const t = useTranslate();
  return (
    <Suspense fallback={null}>
      <Await resolve={products} errorElement={AWAIT_FAILED}>
        {({her, him}) => {
          if (her.length < 2 || him.length < 2) return null;
          const picks = {her, him};
          return (
            <section className="section herhim" aria-labelledby="herhim-h">
              <div className="section-head-row">
                <h2 id="herhim-h">
                  {t('For her, for him')}
                  <span className="section-title-dot" aria-hidden="true">
                    .
                  </span>
                </h2>
              </div>
              <div className="herhim-grid">
                {HERHIM_SIDES.map((side) => (
                  <div className="herhim-half" key={side.key}>
                    <Link
                      to={localize(side.to)}
                      className="herhim-photo"
                      prefetch="intent"
                    >
                      <img
                        src={side.img}
                        alt={side.label}
                        style={{objectPosition: side.pos}}
                        loading="lazy"
                      />
                      <span className="collage-label">
                        {t(side.label)}
                        <span aria-hidden="true"> →</span>
                      </span>
                    </Link>
                    {picks[side.key].map((product) => (
                      <div className="herhim-card" key={product.id}>
                        <ProductItem product={product} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          );
        }}
      </Await>
    </Suspense>
  );
}

/** Price-point row: compact cards, six across — quick wins under €100. */
function UnderHundred({products}: {products: HomeProducts}) {
  return (
    <Suspense fallback={null}>
      <Await resolve={products} errorElement={AWAIT_FAILED}>
        {({under100}) => {
          if (under100.length < 4) return null;
          return (
            <section className="section" aria-labelledby="under-100">
              <SectionHead
                title="Heat under €100"
                id="under-100"
                to="/collections/all?price_max=100"
                linkLabel="Shop under €100"
              />
              <div className="dense-rail">
                <ProductsRail>
                  {under100.map((product) => (
                    <div className="products-carousel-item" key={product.id}>
                      <ProductItem product={product} />
                    </div>
                  ))}
                </ProductsRail>
              </div>
            </section>
          );
        }}
      </Await>
    </Suspense>
  );
}

// Represent has 1 product and Corteiz 12 — too thin to headline a scroller.
// These are the houses with real depth behind them.
const MARQUEE_BRANDS: Array<{label: string; handle: string}> = [
  {label: 'Nike', handle: 'nike'},
  {label: 'Jordan', handle: 'jordan'},
  {label: 'New Balance', handle: 'new-balance'},
  {label: 'adidas', handle: 'adidas'},
  {label: 'UGG', handle: 'ugg-boots-slippers'},
  {label: 'ASICS', handle: 'asics'},
  {label: 'Essentials', handle: 'essentials'},
  {label: 'Supreme', handle: 'supreme'},
  {label: 'Yeezy', handle: 'yeezy'},
  {label: 'Salomon', handle: 'salomon'},
  {label: 'Stussy', handle: 'stussy'},
  {label: 'Sp5der', handle: 'sp5der'},
  {label: 'Denim Tears', handle: 'denim-tears'},
  {label: 'Jacquemus', handle: 'jacquemus'},
  {label: 'Puma', handle: 'puma'},
  {label: 'Vans', handle: 'vans'},
];

function BrandMarquee() {
  const localize = useLocalizedHref();
  const t = useTranslate();
  // Two identical tracks create the seamless CSS loop.
  const track = (ariaHidden: boolean) => (
    <div className="brand-marquee-track" aria-hidden={ariaHidden || undefined}>
      {MARQUEE_BRANDS.map((brand) => (
        <Link
          key={brand.handle}
          to={localize(`/collections/${brand.handle}`)}
          className="brand-marquee-item"
          tabIndex={ariaHidden ? -1 : undefined}
        >
          {brand.label}
          <span className="brand-marquee-star" aria-hidden="true">
            ✦
          </span>
        </Link>
      ))}
    </div>
  );
  return (
    <section className="brand-marquee" aria-label={t('Brands we stock')}>
      {track(false)}
      {track(true)}
    </section>
  );
}

/**
 * Three promise cards, then the questions people actually ask.
 *
 * Every line is a promise the policies already make, with the numbers pulled
 * from `~/data/shop`: dispatch is `SHOP.shipsWithin`, not a flat "48 hours",
 * and the third card says what we do — check every item — rather than issuing
 * a guarantee the shop does not give anywhere else. The answers are the FAQ
 * page's own (`~/data/faq`), so the two can never disagree.
 *
 * <details> rather than a scripted accordion: it opens without JavaScript and
 * the answers are in the HTML for anyone — or anything — reading the page.
 */
function HelpAndPromise() {
  const localize = useLocalizedHref();
  const t = useTranslate();
  const cards = [
    {
      icon: <BsTruck aria-hidden="true" />,
      title: t('Fast {i}dispatch{/i}'),
      body: t(
        'Orders leave us within {shipsWithin}, always with tracking. Typical delivery: {deliveryEstimate}.',
      )
        .replace('{shipsWithin}', t(SHOP.shipsWithin))
        .replace('{deliveryEstimate}', t(SHOP.deliveryEstimate)),
    },
    {
      icon: <BsHeadset aria-hidden="true" />,
      title: t('Premium {i}service{/i}'),
      body: `${t(
        'Personal contact, real answers and careful packing come first.',
      )} ${t(SHOP.responseTime)}.`,
    },
    {
      icon: <BsPatchCheck aria-hidden="true" />,
      title: t('100% {i}authentic{/i}'),
      body: `${t(SHOP.disclaimer)} ${t(
        "If an item doesn't pass our check, it simply doesn't ship.",
      )}`,
    },
  ];
  const questions = HOME_FAQ_QUESTIONS.map((question) =>
    FAQ_ENTRIES.find((entry) => entry.question === question),
  ).filter((entry): entry is (typeof FAQ_ENTRIES)[number] => Boolean(entry));

  return (
    <section className="section home-promise">
      <ul className="home-promise-cards">
        {cards.map((card) => (
          <li key={card.title} className="home-promise-card">
            <h3>
              <span className="home-promise-icon">{card.icon}</span>
              <span>
                <Emphasised text={card.title} />
              </span>
            </h3>
            <p>{card.body}</p>
          </li>
        ))}
      </ul>

      <div className="home-faq">
        <div className="home-faq-head">
          <span className="home-faq-eyebrow">{t('Got questions?')}</span>
          <h2>
            <Emphasised text={t('Frequently {i}asked{/i} questions')} />
          </h2>
        </div>
        <div className="home-faq-list">
          {questions.map((entry) => (
            <details className="home-faq-item" key={entry.question}>
              <summary>{t(entry.question)}</summary>
              <p>{resolveTranslatedAnswer(entry.answer, t)}</p>
            </details>
          ))}
          {/* The support entry points the old "Need help?" card carried. */}
          <p className="home-faq-more">
            <Link to={localize('/pages/faq')}>{t('See all answers')} →</Link>
            <Link to={localize('/pages/size-guide')}>{t('Size guide')}</Link>
            <a
              href={`mailto:${SHOP.email}?subject=${encodeURIComponent(
                'Question for Fast Sneakers',
              )}`}
            >
              {t('Email us')}
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}

function RecommendedProducts({products}: {products: HomeProducts}) {
  const t = useTranslate();
  return (
    <section
      className="section recommended-products"
      aria-labelledby="recommended-products"
    >
      <SectionHead
        title="Staff picks"
        id="recommended-products"
        // Was /collections/all — the whole 9,588-product catalogue, 204 pages
        // of it, where almost nothing carries the `bestseller` tag and so
        // almost nothing shows the badge. "View all" under a Bestsellers
        // heading has to land on the bestsellers.
        to="/collections/bestsellers"
        linkLabel="View all"
      />
      <Suspense
        fallback={<div className="products-loading">{t('Loading…')}</div>}
      >
        <Await resolve={products} errorElement={AWAIT_FAILED}>
          {({best}) => (
            <ProductsRail>
              {best.map((product) => (
                <div className="products-carousel-item" key={product.id}>
                  <ProductItem product={product} badge={t('Staff pick')} />
                </div>
              ))}
            </ProductsRail>
          )}
        </Await>
      </Suspense>
    </section>
  );
}

// Both homepage rails pull a few products from each category bucket and
// interleave them, so shoppers see the whole range (sneakers, tees,
// tracksuits, jackets…) instead of a wall of the same shoes.
/**
 * The least a product needs for the homepage to decide whether it makes a
 * rail: an id to de-duplicate on, a title to rank and vary by, a handle for
 * the hand-picked spotlight, and a price to drop the zero-priced ones.
 * The full card is fetched afterwards, only for the products that won.
 */
const HOME_PICK_FRAGMENT = `#graphql
  fragment HomePick on Product {
    id
    handle
    title
    priceRange {
      minVariantPrice {
        amount
      }
    }
  }
` as const;

const NEW_ARRIVALS_QUERY = `#graphql
  query NewArrivals($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    sneakers: products(first: 8, sortKey: CREATED_AT, reverse: true, query: "product_type:sneakers") {
      nodes { ...HomePick }
    }
    tops: products(first: 8, sortKey: CREATED_AT, reverse: true, query: "(product_type:T-Shirts) OR (product_type:Hoodies)") {
      nodes { ...HomePick }
    }
    sets: products(first: 8, sortKey: CREATED_AT, reverse: true, query: "product_type:Tracksuits") {
      nodes { ...HomePick }
    }
    bottoms: products(first: 8, sortKey: CREATED_AT, reverse: true, query: "(product_type:Jackets) OR (product_type:Pants) OR (product_type:Shorts)") {
      nodes { ...HomePick }
    }
  }
  ${HOME_PICK_FRAGMENT}
` as const;

/** Sale picks (feature grid) + everything under €100 (dense rail). */
const HOME_EXTRAS_QUERY = `#graphql
  query HomeExtras($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    sale: collection(handle: "sale") {
      products(first: 16, sortKey: BEST_SELLING) {
        nodes { ...HomePick }
      }
    }
    under: products(first: 24, sortKey: BEST_SELLING, query: "variants.price:<100") {
      nodes { ...HomePick }
    }
    essentials: products(first: 24, sortKey: BEST_SELLING, query: "tag:'brand:essentials'") {
      nodes { ...HomePick }
    }
    airmax: products(first: 40, sortKey: BEST_SELLING, query: "tag:'model:nike-air-max'") {
      nodes { ...HomePick }
    }
    multicolor: products(first: 24, sortKey: BEST_SELLING, query: "tag:'color:multicolor'") {
      nodes { ...HomePick }
    }
    trending: collection(handle: "sneakers") {
      products(first: 100, sortKey: BEST_SELLING) {
        nodes { ...HomePick }
      }
    }
    searched: products(first: 20, query: "tag:searched") {
      nodes { ...HomePick }
    }
    sandstone: product(handle: "new-balance-2002r-sandstone") {
      ...HomePick
    }
    travisscott: collection(handle: "travis-scott-sneakers") {
      products(first: 30, sortKey: BEST_SELLING) {
        nodes { ...HomePick }
      }
    }
    newbalance: collection(handle: "new-balance") {
      products(first: 40, sortKey: BEST_SELLING) {
        nodes { ...HomePick }
      }
    }
    asics: collection(handle: "asics") {
      products(first: 40, sortKey: BEST_SELLING) {
        nodes { ...HomePick }
      }
    }
    apparel: collection(handle: "clothing") {
      products(first: 100, sortKey: BEST_SELLING) {
        nodes { ...HomePick }
      }
    }
    forher: collection(handle: "women") {
      products(first: 30, sortKey: BEST_SELLING) {
        nodes { ...HomePick }
      }
    }
    forhim: collection(handle: "men") {
      products(first: 30, sortKey: BEST_SELLING) {
        nodes { ...HomePick }
      }
    }
    # Fallbacks for a catalogue that has no curated collections or ranking
    # tags yet: the rails above read these whenever their collection is
    # missing or empty, so the home page never renders a blank section.
    fbSneakers: products(first: 100, sortKey: BEST_SELLING, query: "product_type:sneakers") {
      nodes { ...HomePick }
    }
    fbTravis: products(first: 30, sortKey: BEST_SELLING, query: "tag:'brand:travis-scott' AND product_type:sneakers") {
      nodes { ...HomePick }
    }
    fbNewBalance: products(first: 40, sortKey: BEST_SELLING, query: "tag:'brand:new-balance'") {
      nodes { ...HomePick }
    }
    fbAsics: products(first: 40, sortKey: BEST_SELLING, query: "tag:'brand:asics'") {
      nodes { ...HomePick }
    }
    fbApparel: products(first: 100, sortKey: BEST_SELLING, query: "-product_type:sneakers -product_type:Boots -product_type:Slippers -product_type:bags") {
      nodes { ...HomePick }
    }
    fbSale: products(first: 16, sortKey: BEST_SELLING, query: "tag:Sale") {
      nodes { ...HomePick }
    }
    fbWomen: products(first: 30, sortKey: BEST_SELLING, query: "tag:wmns") {
      nodes { ...HomePick }
    }
    fbMen: products(first: 30, sortKey: BEST_SELLING, query: "tag:men") {
      nodes { ...HomePick }
    }
    fbTop: products(first: 60, sortKey: BEST_SELLING) {
      nodes { ...HomePick }
    }
  }
  ${HOME_PICK_FRAGMENT}
` as const;

/**
 * The catalog's REAL market bestsellers: every product carrying the
 * `bestseller` tag (with its `bs:NNN` global rank). Lightweight on purpose —
 * the pipeline ranks + shuffles ids first, then fetches card data for the
 * handful it will actually render.
 */
/**
 * Prices for the hand-picked hero tiles.
 *
 * Product tiles are looked up with `product(handle:)`, one alias each. The
 * obvious shortcut — products(query: "handle:a OR handle:b") — silently
 * returns the wrong thing: the Storefront API's product search supports
 * title, vendor, tag, product_type and price, but NOT handle, and an
 * unsupported field is ignored rather than rejected. That query matched
 * nothing and every footwear tile lost its price.
 *
 * Six slots, filled in order from HERO_TILE_HANDLES and padded with empty
 * strings; `product(handle: "")` resolves to null, so unused slots cost
 * nothing. A seventh product tile needs a seventh alias here.
 *
 * Collection tiles take the cheapest piece on their shelf instead, shown as
 * "From EUR x".
 */
const HERO_PRICES_QUERY = `#graphql
  fragment HeroFloor on Product {
    handle
    priceRange {
      minVariantPrice {
        amount
        currencyCode
      }
    }
  }
  query HomeHeroPrices(
    $h0: String!
    $h1: String!
    $h2: String!
    $h3: String!
    $h4: String!
    $h5: String!
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    p0: product(handle: $h0) { ...HeroFloor }
    p1: product(handle: $h1) { ...HeroFloor }
    p2: product(handle: $h2) { ...HeroFloor }
    p3: product(handle: $h3) { ...HeroFloor }
    p4: product(handle: $h4) { ...HeroFloor }
    p5: product(handle: $h5) { ...HeroFloor }
    heroEssentials: collection(handle: "essentials") {
      products(first: 1, sortKey: PRICE) {
        nodes { priceRange { minVariantPrice { amount currencyCode } } }
      }
    }
    heroJacquemus: collection(handle: "jacquemus") {
      products(first: 1, sortKey: PRICE) {
        nodes { priceRange { minVariantPrice { amount currencyCode } } }
      }
    }
    heroStussy: collection(handle: "stussy") {
      products(first: 1, sortKey: PRICE) {
        nodes { priceRange { minVariantPrice { amount currencyCode } } }
      }
    }
    heroUgg: collection(handle: "ugg-boots-slippers") {
      products(first: 1, sortKey: PRICE) {
        nodes { priceRange { minVariantPrice { amount currencyCode } } }
      }
    }
  }
` as const;

const BESTSELLERS_LIGHT_QUERY = `#graphql
  query HomeBestsellersLight($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    products(first: 250, query: "tag:bestseller") {
      nodes {
        ...HomePick
        tags
      }
    }
  }
  ${HOME_PICK_FRAGMENT}
` as const;

/** Full card data for the shuffled bestseller picks (order preserved). */
const HOME_PRODUCTS_BY_IDS_QUERY = `#graphql
  ${PRODUCT_CARD_FRAGMENT}
  query HomeProductsByIds(
    $ids: [ID!]!
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    nodes(ids: $ids) {
      ... on Product {
        ...ProductCard
      }
    }
  }
` as const;
