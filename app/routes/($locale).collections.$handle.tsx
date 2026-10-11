import {
  Link,
  isRouteErrorResponse,
  redirect,
  useLoaderData,
  useNavigate,
  useRouteError,
  useSearchParams,
} from 'react-router';
import type {Route} from './+types/($locale).collections.$handle';
import {getPaginationVariables, Analytics} from '@shopify/hydrogen';
import {redirectIfHandleIsLocalized} from '~/lib/redirect';
import {ProductItem} from '~/components/ProductItem';
import {FilterBar} from '~/components/FilterBar';
import {Pager} from '~/components/Pager';
import {CategoryNav, railParent} from '~/components/CategoryNav';
import {parseCollectionSort} from '~/lib/sort';
import {
  brandFilterTag,
  getTotalCount,
  hasSellablePrice,
  isCatalogProduct,
  parseCollectionFilters,
  parseShow,
} from '~/lib/filters';
import {localizePath} from '~/lib/i18n';
import {useLocalizedHref} from '~/lib/localizedLink';
import {useTranslate} from '~/lib/useTranslate';
import {CollectionOfferBar, CollectionTrustRow} from '~/components/TrustBar';
import {listingCache} from '~/lib/cache';
import {
  buildMeta,
  canonicalPathname,
  collectionJsonLd,
  originFrom,
  paginationCanonical,
} from '~/lib/seo';
import {
  PRODUCT_CARD_FRAGMENT,
  packCard,
  type PackedProductCard,
} from '~/lib/productCardFragment';
import type {ProductCardFragment} from 'storefrontapi.generated';
import type {
  ProductCollectionSortKeys,
  ProductFilter,
} from '@shopify/hydrogen/storefront-api-types';

export const meta: Route.MetaFunction = ({data, matches, location}) => {
  const collection = data?.collection;
  const title = collection?.title ?? 'Collection';
  const description =
    collection?.description ||
    `Shop ${title} — sourced from partners, free tracked shipping and 14-day returns.`;

  // Collection pages compete for the head terms, so they get the same
  // structured-data treatment product pages have always had. See
  // `collectionJsonLd` for what the three graphs are and why.
  const origin = originFrom(matches);
  const products = collection?.products?.nodes ?? [];

  // Pages 2+ reached through the pager canonicalise to THEMSELVES, not to
  // page one — otherwise Google discards them and every product link on
  // them. See `paginationCanonical` for the full reasoning. The page number
  // goes in the title too, so nine pages do not share one <title>.
  const pagination = paginationCanonical(location.search);

  return buildMeta(
    {matches, pathname: location.pathname},
    {
      title: pagination.page > 1 ? `${title} – Page ${pagination.page}` : title,
      description,
      canonicalSearch: pagination.search,
      // First product image doubles as the social card for the collection.
      image: products[0]?.featuredImage?.url ?? undefined,
      jsonLd: collectionJsonLd({
        origin,
        canonicalPath: canonicalPathname(location.pathname),
        title,
        description: collection?.description,
        products,
      }),
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
/** How many products a single union query pulls in per page. */
const UNION_FETCH_LIMIT = 250;
/** Pages walked per selected value — 4 × 250 covers every realistic facet. */
const UNION_MAX_PAGES = 4;

/** How many market bestsellers can be pinned to the top of a collection. */
const MAX_PINNED = 24;

/**
 * Collections whose order is set by hand in Shopify (sort order MANUAL) and
 * must reach the shopper as-is, so bestsellers are NOT pinned above them.
 * Both Travis Scott shelves run Air Jordan 1 Lows first (owner request,
 * ordered by scripts/curate-travis-scott.mjs); pinning by `bs:` rank put a
 * High, the AJ4 and a Jumpman Jack in between them. The Storefront API does
 * not expose a collection's sort order, hence the list.
 */
const CURATED_ORDER_HANDLES = new Set([
  'travis-scott',
  'travis-scott-sneakers',
  // scripts/curate-collection-order.mjs: tees and hoodies before the Nike x
  // Stussy sneakers; Sambas first on adidas.
  'stussy',
  'adidas',
]);

async function loadCriticalData({context, params, request}: Route.LoaderArgs) {
  const {handle} = params;
  const {storefront} = context;
  const url = new URL(request.url);
  const pageBy = parseShow(url);
  const paginationVariables = getPaginationVariables(request, {pageBy});
  const {sortKey, reverse} = parseCollectionSort(url);
  const parsed = parseCollectionFilters(url);
  const {filters, needsUnion} = parsed;

  if (!handle) {
    throw redirect(localizePath('/collections', context.storefront.i18n));
  }

  // Market bestsellers (tagged `bestseller` + `bs:NN` rank) are pinned to
  // the top of the DEFAULT view only — as soon as the shopper sorts,
  // filters or paginates, they see exactly what they asked for.
  const wantsPins =
    !CURATED_ORDER_HANDLES.has(handle ?? '') &&
    filters.length === 0 &&
    !needsUnion &&
    !url.searchParams.has('sort_by') &&
    !url.searchParams.has('cursor') &&
    (Number(url.searchParams.get('page') ?? '1') || 1) <= 1;

  const [{collection}, pinnedLight] = await Promise.all([
    storefront.query(COLLECTION_QUERY, {
      variables: {handle, sortKey, reverse, filters, ...paginationVariables},
      // Shared between every visitor to this shelf — see ~/lib/cache.
      cache: listingCache(storefront),
    }),
    wantsPins
      ? storefront.query(PINNED_BESTSELLERS_QUERY, {
          variables: {handle},
          cache: listingCache(storefront),
        })
      : Promise.resolve(null),
  ]);

  if (!collection) {
    throw new Response(`Collection ${handle} not found`, {
      status: 404,
    });
  }

  // The API handle might be localized, so redirect to the localized handle
  redirectIfHandleIsLocalized(request, {handle, data: collection});

  // Order this collection's bestsellers by global rank (`bs:NNN` tag —
  // zero-padded, so a plain string sort is rank order), then fetch full
  // card data for just the pinned page. Two-step because a collection can
  // contain up to 250 ranked bestsellers and we only render the best few.
  let pinned: PackedProductCard[] = [];
  const lightNodes = (pinnedLight?.collection?.products?.nodes ?? []) as Array<{
    id: string;
    tags?: string[] | null;
  }>;
  if (lightNodes.length > 0) {
    const topIds = lightNodes
      .map((node) => ({
        id: node.id,
        rank:
          (node.tags ?? []).find((tag) => tag.startsWith('bs:')) ?? 'bs:999',
      }))
      .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0))
      .slice(0, MAX_PINNED)
      .map((entry) => entry.id);
    const {nodes} = await storefront.query(PRODUCTS_BY_IDS_QUERY, {
      variables: {ids: topIds},
      cache: listingCache(storefront),
    });
    // nodes() preserves the input order, so rank order survives.
    pinned = ((nodes ?? []).filter(Boolean) as ProductCardFragment[])
      .filter(hasSellablePrice)
      .map((card) => packCard(card));
  }

  // Variants travel as packed rows rather than full objects — it is most of
  // what a listing page serialises for hydration. See `packCard`.
  const slimCollection = {
    ...collection,
    products: {
      ...collection.products,
      nodes: collection.products.nodes.map((card) => packCard(card)),
    },
  };

  if (!needsUnion) {
    return {collection: slimCollection, union: null, pageBy, pinned};
  }

  const union = await loadUnion({
    storefront,
    handle,
    parsed,
    sortKey,
    reverse,
    pageBy,
    page: Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1),
  });

  return {collection: slimCollection, union, pageBy, pinned};
}

type LightNode = {
  id: string;
  tags: string[];
  createdAt: string;
  priceRange: {minVariantPrice: {amount: string}};
  compareAtPriceRange: {maxVariantPrice: {amount: string}} | null;
};

/**
 * OR-combining filters isn't something the Storefront API can express — its
 * `filters` argument ANDs every entry. So when the shopper picks several
 * colours (or mixes colour + brand + size), we run one lightweight query per
 * value of the largest group, union the results, apply the remaining groups
 * in memory, and paginate the merged pool ourselves.
 */
async function loadUnion({
  storefront,
  handle,
  parsed,
  sortKey,
  reverse,
  pageBy,
  page,
}: {
  storefront: Route.LoaderArgs['context']['storefront'];
  handle: string;
  parsed: ReturnType<typeof parseCollectionFilters>;
  sortKey: ProductCollectionSortKeys;
  reverse: boolean;
  pageBy: number;
  page: number;
}) {
  const {colors, brands, sizes, deals, priceMin, priceMax} = parsed;

  const groups: Array<{prefix: string; values: string[]}> = [
    {prefix: 'color', values: colors},
    {prefix: 'brand', values: brands},
    {prefix: 'size', values: sizes},
  ].filter((group) => group.values.length > 0);

  const priceFilter =
    priceMin != null || priceMax != null
      ? [
          {
            price: {
              ...(priceMin != null ? {min: priceMin} : {}),
              ...(priceMax != null ? {max: priceMax} : {}),
            },
          },
        ]
      : [];

  // The group we fan out over server-side; every other multi-value group is
  // applied afterwards against each product's tags.
  const unionGroup =
    groups.filter((group) => group.values.length > 1).sort(
      (a, b) => b.values.length - a.values.length,
    )[0] ?? null;
  const singleFilters = groups
    .filter((group) => group !== unionGroup && group.values.length === 1)
    .map((group) => ({tag: tagFor(group.prefix, group.values[0])}));
  const postGroups = groups.filter(
    (group) => group !== unionGroup && group.values.length > 1,
  );

  const queryVariants = unionGroup
    ? unionGroup.values.map((value) => [
        {tag: tagFor(unionGroup.prefix, value)},
        ...singleFilters,
        ...priceFilter,
      ])
    : [[...singleFilters, ...priceFilter]];

  const results = await Promise.all(
    queryVariants.map((variantFilters) =>
      fetchAllPages(storefront, handle, variantFilters, sortKey, reverse),
    ),
  );

  const seen = new Set<string>();
  let pool: LightNode[] = [];
  let truncated = false;
  for (const result of results) {
    if (result.truncated) truncated = true;
    for (const node of result.nodes) {
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      pool.push(node);
    }
  }

  // Products with a €0 variant sort nonsensically and shouldn't be buyable.
  pool = pool.filter((node) => priceOf(node) > 0);

  // Remaining OR groups + the Deals filter, applied against the pool.
  for (const group of postGroups) {
    // tagFor, not `prefix:value`: a Brand row can be a silhouette, a collab
    // or a garment, whose tags are model: / collab: / type:, never brand:.
    const wanted = new Set(
      group.values.map((value) => tagFor(group.prefix, value)),
    );
    pool = pool.filter((node) =>
      (node.tags ?? []).some((tag) => wanted.has(tag)),
    );
  }
  if (deals) {
    pool = pool.filter((node) => discountOf(node) > 0);
  }

  const sortBy = parsed.deals ? 'deals' : null;
  if (sortBy === 'deals') {
    pool.sort((a, b) => discountOf(b) - discountOf(a));
  } else if (sortKey === 'PRICE') {
    pool.sort((a, b) => {
      const delta = priceOf(a) - priceOf(b);
      return reverse ? -delta : delta;
    });
  } else if (sortKey === 'CREATED') {
    pool.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  const total = pool.length;
  const pageCount = Math.max(1, Math.ceil(total / pageBy));
  const currentPage = Math.min(page, pageCount);
  const slice = pool.slice((currentPage - 1) * pageBy, currentPage * pageBy);

  let products: PackedProductCard[] = [];
  if (slice.length > 0) {
    const {nodes} = await storefront.query(PRODUCTS_BY_IDS_QUERY, {
      variables: {ids: slice.map((node) => node.id)},
      cache: listingCache(storefront),
    });
    products = ((nodes ?? []).filter(Boolean) as ProductCardFragment[]).map(
      (card) => packCard(card),
    );
  }

  return {products, total, page: currentPage, pageCount, truncated};
}

/**
 * Walks a filtered collection query up to UNION_MAX_PAGES pages so a popular
 * value (e.g. 356 black sneakers) isn't cut off at a single 250-item page.
 */
async function fetchAllPages(
  storefront: Route.LoaderArgs['context']['storefront'],
  handle: string,
  filters: ProductFilter[],
  sortKey: ProductCollectionSortKeys,
  reverse: boolean,
): Promise<{nodes: LightNode[]; truncated: boolean}> {
  const nodes: LightNode[] = [];
  let after: string | null = null;

  for (let page = 0; page < UNION_MAX_PAGES; page++) {
    const response: any = await storefront.query(UNION_PRODUCTS_QUERY, {
      variables: {
        handle,
        filters,
        sortKey,
        reverse,
        first: UNION_FETCH_LIMIT,
        after,
      },
      cache: listingCache(storefront),
    });
    const products = response?.collection?.products;
    nodes.push(...((products?.nodes ?? []) as LightNode[]));
    if (!products?.pageInfo?.hasNextPage) {
      return {nodes, truncated: false};
    }
    after = products.pageInfo.endCursor as string;
  }

  return {nodes, truncated: true};
}

/**
 * Brand rows carry either a house (`brand:nike`) or a silhouette
 * (`model:nike-dunk`); both travel in the same param so they OR together.
 */
function tagFor(prefix: string, value: string): string {
  return prefix === 'brand' ? brandFilterTag(value) : `${prefix}:${value}`;
}

function priceOf(node: LightNode): number {
  return Number(node.priceRange?.minVariantPrice?.amount ?? 0);
}

/** Discount fraction (0–1) from compare-at vs current price. */
function discountOf(node: LightNode): number {
  const price = priceOf(node);
  const compare = Number(
    node.compareAtPriceRange?.maxVariantPrice?.amount ?? 0,
  );
  if (!price || compare <= price) return 0;
  return 1 - price / compare;
}

/**
 * Load data for rendering content below the fold. This data is deferred and will be
 * fetched after the initial page load. If it's unavailable, the page should still 200.
 * Make sure to not throw any errors here, as it will cause the page to 500.
 */
function loadDeferredData({context}: Route.LoaderArgs) {
  return {};
}

export default function Collection() {
  const {collection, union, pageBy, pinned} = useLoaderData<typeof loader>();
  const localize = useLocalizedHref();
  const t = useTranslate();
  const [searchParams] = useSearchParams();

  const filterData = collection.products.filters;
  const collectionTotal = getTotalCount(filterData);
  const total = union ? union.total : collectionTotal;

  // Market bestsellers pinned on top of the default view; anything pinned
  // is removed from the regular grid below so page one never repeats it.
  const pinnedProducts = union ? [] : (pinned ?? []);
  const pinnedIds = new Set(pinnedProducts.map((product) => product.id));

  // Drop products whose price data is broken (see hasSellablePrice) so the
  // grid never contradicts the chosen sort order, and add-ons like shipping
  // protection, which the smart collections sweep in but nobody browses for.
  const listedProducts = (
    union ? union.products : collection.products.nodes.filter(hasSellablePrice)
  )
    .filter(isCatalogProduct)
    .filter((product) => !pinnedIds.has(product.id));
  const shown = pinnedProducts.length + listedProducts.length;

  // Numbered pager for the cursor path: the cursor drives WHICH page the
  // API returns; `page` in the URL just keeps the human-readable counter
  // in sync. Without a cursor we are always on page 1.
  const pageInfo = collection.products.pageInfo;
  const currentPage = searchParams.has('cursor')
    ? Math.max(1, Number(searchParams.get('page') ?? '1') || 1)
    : 1;
  const standardPageCount =
    collectionTotal != null
      ? Math.max(1, Math.ceil(collectionTotal / pageBy))
      : null;

  const cursorHref = (
    target: number,
    cursor: string | null | undefined,
    direction: 'next' | 'previous',
  ) => {
    const next = new URLSearchParams(searchParams);
    if (target <= 1) {
      next.delete('page');
      next.delete('cursor');
      next.delete('direction');
    } else {
      next.set('page', String(target));
      if (cursor) next.set('cursor', cursor);
      next.set('direction', direction);
    }
    const query = next.toString();
    return query ? `?${query}` : '?';
  };

  const standardPrevTo = pageInfo?.hasPreviousPage
    ? cursorHref(currentPage - 1, pageInfo.startCursor, 'previous')
    : null;
  const standardNextTo = pageInfo?.hasNextPage
    ? cursorHref(currentPage + 1, pageInfo.endCursor, 'next')
    : null;

  // Union path pages are plain ?page= links over the merged pool.
  const unionHref = (target: number) => {
    const next = new URLSearchParams(searchParams);
    if (target <= 1) next.delete('page');
    else next.set('page', String(target));
    const query = next.toString();
    return query ? `?${query}` : '?';
  };

  return (
    <div className="collection page-container">
      <CollectionOfferBar />
      {/* Title only. The count sits with the filters, category jumps sit in
          the rail, and the blurb moves below the grid — shoppers get to the
          products immediately, search engines still get the copy. */}
      {/* Outside the hero on purpose: .collection-hero is a grid with a
          1.5rem row gap, which would force the back control 24px off the
          title no matter what margin it carries. */}
      <BackControl handle={collection.handle} />

      <div className="collection-hero">
        <div className="collection-hero-main">
          <h1>{collection.title}</h1>
          <CollectionTrustRow />
        </div>
      </div>

      <div className="collection-layout">
        <CategoryNav handle={collection.handle} />

        <div className="collection-main">
          <FilterBar
            filterData={filterData}
            total={total}
            handle={collection.handle}
          />

          {union?.truncated ? (
            <p className="collection-union-note">
              Showing the first {union.total} matches — add another filter to
              narrow things down.
            </p>
          ) : null}

          {shown === 0 ? (
            <div className="collection-empty">
              <p>
                No products match these filters — try removing a filter, or
                browse the full catalog.
              </p>
              <div className="collection-empty-actions">
                <Link className="btn btn-dark" to={localize(`/collections/${collection.handle}`)}>
                  Clear filters
                </Link>
                <Link
                  className="btn btn-ghost"
                  to={localize('/collections/all')}
                >
                  Shop all products
                </Link>
              </div>
            </div>
          ) : union ? (
            <>
              {/* Cards are <h3>; without an <h2> the outline jumps from the
                  page's <h1> straight to them. Screen readers only. */}
              <h2 className="sr-only">{t('All products')}</h2>
              <div className="products-grid">
                {union.products.map((product, index) => (
                  <ProductItem
                    key={product.id}
                    product={product}
                    loading={index < 10 ? 'eager' : undefined}
                  />
                ))}
              </div>
              <Pager
                page={union.page}
                pageCount={union.pageCount}
                prevTo={union.page > 1 ? unionHref(union.page - 1) : null}
                nextTo={
                  union.page < union.pageCount
                    ? unionHref(union.page + 1)
                    : null
                }
              />
            </>
          ) : (
            <>
              {/* Cards are <h3>; without an <h2> the outline jumps from the
                  page's <h1> straight to them. Screen readers only. */}
              <h2 className="sr-only">{t('All products')}</h2>
              <div className="products-grid">
                {pinnedProducts.map((product, index) => (
                  <ProductItem
                    key={product.id}
                    product={product}
                    loading={index < 10 ? 'eager' : undefined}
                    badge={t('Staff pick')}
                  />
                ))}
                {listedProducts.map((product, index) => (
                  <ProductItem
                    key={product.id}
                    product={product}
                    loading={
                      pinnedProducts.length + index < 10 ? 'eager' : undefined
                    }
                  />
                ))}
              </div>
              <Pager
                page={currentPage}
                pageCount={standardPageCount}
                prevTo={standardPrevTo}
                nextTo={standardNextTo}
              />
            </>
          )}
        </div>
      </div>

      <Analytics.CollectionView
        data={{
          collection: {
            id: collection.id,
            handle: collection.handle,
          },
        }}
      />
    </div>
  );
}

/**
 * Back control above the title. Prefers real history, so it returns the
 * shopper exactly where they came from. When they landed cold — a search
 * result, an ad, a shared link — there is no history to pop, so it walks up
 * to the department instead of stranding them.
 *
 * Always a button, never a conditional link: reading `history.length` during
 * render would disagree between the server and the client and break
 * hydration. The check happens on click, where it is safe.
 */
function BackControl({handle}: {handle: string}) {
  const navigate = useNavigate();
  const localize = useLocalizedHref();
  const parent = railParent(handle);

  return (
    <button
      type="button"
      className="collection-back reset"
      onClick={() => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
          void navigate(-1);
        } else {
          void navigate(localize(`/collections/${parent.handle}`));
        }
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="m15 5-7 7 7 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Back
    </button>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const localize = useLocalizedHref();
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  if (!notFound) {
    console.error(error);
  }

  return (
    <div className="route-error">
      <span className="route-error-status">{notFound ? '404' : 'Error'}</span>
      <h1>{notFound ? 'Collection not available' : 'Something went wrong'}</h1>
      <p>
        {notFound
          ? 'This collection doesn’t exist yet or has been removed — it may still be on its way.'
          : 'We couldn’t load this collection. Please try again in a moment.'}
      </p>
      <div className="route-error-actions">
        <Link className="btn btn-primary" to={localize('/collections/all')}>
          Shop all products
        </Link>
        <Link className="btn btn-ghost" to={localize('/')}>
          Back to homepage
        </Link>
      </div>
    </div>
  );
}

/**
 * Lightweight pass used by the union path: just enough per product to
 * de-duplicate, apply the remaining filters and sort locally.
 */
const UNION_PRODUCTS_QUERY = `#graphql
  query UnionProducts(
    $handle: String!
    $filters: [ProductFilter!]
    $sortKey: ProductCollectionSortKeys
    $reverse: Boolean
    $first: Int!
    $after: String
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    collection(handle: $handle) {
      products(
        first: $first
        after: $after
        filters: $filters
        sortKey: $sortKey
        reverse: $reverse
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          tags
          createdAt
          priceRange {
            minVariantPrice {
              amount
            }
          }
          compareAtPriceRange {
            maxVariantPrice {
              amount
            }
          }
        }
      }
    }
  }
` as const;

/**
 * Market bestsellers inside THIS collection — products tagged `bestseller`
 * (with a `bs:NNN` global rank tag) that are members of the collection.
 * Deliberately lightweight (id + tags only): up to 250 of the catalog's
 * ranked bestsellers can sit in one collection, and the loader only needs
 * their ranks to decide which few get full card data.
 */
const PINNED_BESTSELLERS_QUERY = `#graphql
  query CollectionPinnedBestsellers(
    $handle: String!
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    collection(handle: $handle) {
      products(first: 250, filters: [{tag: "bestseller"}]) {
        nodes {
          id
          tags
        }
      }
    }
  }
` as const;

/** Full card data for just the products on the current union page. */
const PRODUCTS_BY_IDS_QUERY = `#graphql
  ${PRODUCT_CARD_FRAGMENT}
  query CollectionProductsByIds(
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

// NOTE: https://shopify.dev/docs/api/storefront/latest/objects/collection
const COLLECTION_QUERY = `#graphql
  ${PRODUCT_CARD_FRAGMENT}
  query Collection(
    $handle: String!
    $country: CountryCode
    $language: LanguageCode
    $first: Int
    $last: Int
    $startCursor: String
    $endCursor: String
    $sortKey: ProductCollectionSortKeys
    $reverse: Boolean
    $filters: [ProductFilter!]
  ) @inContext(country: $country, language: $language) {
    collection(handle: $handle) {
      id
      handle
      title
      description
      descriptionHtml
      products(
        first: $first,
        last: $last,
        before: $startCursor,
        after: $endCursor,
        sortKey: $sortKey,
        reverse: $reverse,
        filters: $filters
      ) {
        nodes {
          ...ProductCard
        }
        filters {
          id
          label
          type
          values {
            id
            label
            count
            input
          }
        }
        pageInfo {
          hasPreviousPage
          hasNextPage
          endCursor
          startCursor
        }
      }
    }
  }
` as const;
