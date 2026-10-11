import {Link, useLoaderData, useSearchParams} from 'react-router';
import {rankByTerm} from '~/lib/searchRank';
import type {Route} from './+types/($locale).search';
import {getPaginationVariables, Analytics} from '@shopify/hydrogen';
import {SearchForm} from '~/components/SearchForm';
import {SearchResults} from '~/components/SearchResults';
import {FilterBar} from '~/components/FilterBar';
import {Pager} from '~/components/Pager';
import {ProductItem} from '~/components/ProductItem';
import {
  type PredictiveSearchReturn,
  getEmptyPredictiveSearchResult,
} from '~/lib/search';
import type {
  PredictiveSearchQuery,
  ProductCardFragment,
  RegularSearchQuery,
} from 'storefrontapi.generated';
import type {
  ProductFilter,
  SearchSortKeys,
} from '@shopify/hydrogen/storefront-api-types';
import {buildMeta} from '~/lib/seo';
import {
  brandFilterTag,
  hasSellablePrice,
  isCatalogProduct,
  parseCollectionFilters,
  parseShow,
  type FilterData,
} from '~/lib/filters';
import {listingCache} from '~/lib/cache';
import {useLocalizedHref} from '~/lib/localizedLink';
import {useTranslate} from '~/lib/useTranslate';
import {
  PRODUCT_CARD_FRAGMENT,
  packCard,
  type PackedProductCard,
} from '~/lib/productCardFragment';

export const meta: Route.MetaFunction = ({matches, location}) => {
  return buildMeta(
    {matches, pathname: location.pathname},
    {title: 'Search', noindex: true},
  );
};

export async function loader({request, context}: Route.LoaderArgs) {
  const url = new URL(request.url);
  const isPredictive = url.searchParams.has('predictive');
  const searchPromise: Promise<PredictiveSearchReturn | RegularSearchPageData> =
    isPredictive
      ? predictiveSearch({request, context})
      : regularSearch({request, context});

  searchPromise.catch((error: Error) => {
    console.error(error);
    return {term: '', result: null, error: error.message};
  });

  return await searchPromise;
}

/**
 * Renders the /search route — the "View all results" page behind the
 * predictive search. Products get the same filter bar as a collection page
 * (sort, brand, colour, size, price), driven by the same URL params, so a
 * shopper who searched "samba" can narrow to black, size 42, under €150.
 */
export default function SearchPage() {
  const data = useLoaderData<typeof loader>();
  if (data.type === 'predictive') return null;
  return <RegularSearchPage data={data} />;
}

function RegularSearchPage({data}: {data: RegularSearchPageData}) {
  const {term, error, pages, articles, listing} = data;
  const localize = useLocalizedHref();
  const t = useTranslate();
  const [searchParams] = useSearchParams();

  const hasFilters = FILTER_PARAMS.some((key) => searchParams.has(key));
  const products = listing?.products ?? [];
  const total = listing?.total ?? 0;
  const hasAnything =
    total > 0 ||
    products.length > 0 ||
    (pages?.nodes.length ?? 0) > 0 ||
    (articles?.nodes.length ?? 0) > 0;

  // Page links. The cursor path carries the API cursor plus a human page
  // number; the pooled path paginates its own list with ?page= alone.
  const hrefFor = (
    target: number,
    cursor?: string | null,
    direction?: 'next' | 'previous',
  ) => {
    const next = new URLSearchParams(searchParams);
    next.delete('cursor');
    next.delete('direction');
    if (target <= 1) {
      next.delete('page');
    } else {
      next.set('page', String(target));
      if (cursor && direction) {
        next.set('cursor', cursor);
        next.set('direction', direction);
      }
    }
    return `?${next.toString()}`;
  };

  let prevTo: string | null = null;
  let nextTo: string | null = null;
  if (listing?.mode === 'pool') {
    prevTo = listing.page > 1 ? hrefFor(listing.page - 1) : null;
    nextTo =
      listing.page < listing.pageCount ? hrefFor(listing.page + 1) : null;
  } else if (listing?.pageInfo) {
    const {pageInfo} = listing;
    prevTo = pageInfo.hasPreviousPage
      ? hrefFor(listing.page - 1, pageInfo.startCursor, 'previous')
      : null;
    nextTo = pageInfo.hasNextPage
      ? hrefFor(listing.page + 1, pageInfo.endCursor, 'next')
      : null;
  }

  const clearHref = localize(`/search?q=${encodeURIComponent(term)}`);

  return (
    <div className="search page-container">
      <div className="page-header">
        <h1>
          {term ? (
            <>
              {t('Search')}: <span className="search-term">“{term}”</span>
            </>
          ) : (
            t('Search')
          )}
        </h1>
        {!term ? <p>Find products, guides and pages across the store.</p> : null}
      </div>
      <SearchForm className="search-page-form">
        {({inputRef}) => (
          <>
            <input
              defaultValue={term}
              name="q"
              placeholder="Search products or brands…"
              aria-label="Search"
              ref={inputRef}
              type="search"
            />
            <button type="submit" className="btn btn-primary">
              {t('Search')}
            </button>
          </>
        )}
      </SearchForm>
      {error && (
        <p className="search-error" role="alert">
          {error}
        </p>
      )}

      {!term || (!hasAnything && !hasFilters) ? (
        <SearchResults.Empty />
      ) : (
        <div className="search-results">
          {total > 0 || hasFilters ? (
            <div className="search-result search-products">
              <FilterBar filterData={listing?.filterData} total={total} />

              {listing?.mode === 'pool' && listing.truncated ? (
                <p className="collection-union-note">
                  Showing the first {listing.total} matches — add another
                  filter to narrow things down.
                </p>
              ) : null}

              {products.length === 0 ? (
                <div className="collection-empty">
                  <p>
                    No products match these filters — try removing a filter.
                  </p>
                  <div className="collection-empty-actions">
                    <Link className="btn btn-dark" to={clearHref}>
                      Clear filters
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="sr-only">{t('Products')}</h2>
                  <div className="products-grid">
                    {products.map((product, index) => (
                      <ProductItem
                        key={product.id}
                        product={product}
                        loading={index < 8 ? 'eager' : undefined}
                      />
                    ))}
                  </div>
                  <Pager
                    page={listing?.page ?? 1}
                    pageCount={listing?.pageCount ?? null}
                    prevTo={prevTo}
                    nextTo={nextTo}
                  />
                </>
              )}
            </div>
          ) : null}
          {/* Pages and guides only on the plain first page: once the shopper
              is filtering or paging through products they are shopping. */}
          {!hasFilters && (listing?.page ?? 1) <= 1 ? (
            <>
              {pages ? <SearchResults.Pages pages={pages} term={term} /> : null}
              {articles ? (
                <SearchResults.Articles articles={articles} term={term} />
              ) : null}
            </>
          ) : null}
        </div>
      )}
      <Analytics.SearchView
        data={{searchTerm: term, searchResults: {total, products}}}
      />
    </div>
  );
}

/** URL params that narrow or re-order the product results. */
const FILTER_PARAMS = [
  'color',
  'brand',
  'size',
  'price_min',
  'price_max',
  'deals',
  'sort_by',
];

type SearchListing = {
  products: PackedProductCard[];
  total: number;
  page: number;
  pageCount: number | null;
  filterData: FilterData[];
} & (
  | {
      mode: 'cursor';
      pageInfo: {
        hasPreviousPage: boolean;
        hasNextPage: boolean;
        startCursor?: string | null;
        endCursor?: string | null;
      } | null;
    }
  | {mode: 'pool'; pageCount: number; truncated: boolean}
);

export type RegularSearchPageData = {
  type: 'regular';
  term: string;
  error?: string;
  pages: RegularSearchQuery['pages'] | null;
  articles: RegularSearchQuery['articles'] | null;
  listing: SearchListing | null;
};

/**
 * Search can only sort by relevance or price. "New" and "Deals" are done on
 * a pooled result list instead (see loadSearchPool).
 */
function parseSearchSort(url: URL): {
  sortKey: SearchSortKeys;
  reverse: boolean;
  newest: boolean;
} {
  switch (url.searchParams.get('sort_by')) {
    case 'price-ascending':
      return {sortKey: 'PRICE', reverse: false, newest: false};
    case 'price-descending':
      return {sortKey: 'PRICE', reverse: true, newest: false};
    case 'newest':
      return {sortKey: 'RELEVANCE', reverse: false, newest: true};
    default:
      return {sortKey: 'RELEVANCE', reverse: false, newest: false};
  }
}

/**
 * Regular search query and fragments
 */
const SEARCH_PAGE_FRAGMENT = `#graphql
  fragment SearchPage on Page {
     __typename
     handle
    id
    title
    trackingParameters
  }
` as const;

const SEARCH_ARTICLE_FRAGMENT = `#graphql
  fragment SearchArticle on Article {
    __typename
    handle
    id
    title
    trackingParameters
  }
` as const;

// NOTE: https://shopify.dev/docs/api/storefront/latest/queries/search
export const SEARCH_QUERY = `#graphql
  query RegularSearch(
    $country: CountryCode
    $endCursor: String
    $first: Int
    $language: LanguageCode
    $last: Int
    $term: String!
    $startCursor: String
    $productFilters: [ProductFilter!]
    $sortKey: SearchSortKeys
    $reverse: Boolean
  ) @inContext(country: $country, language: $language) {
    articles: search(
      query: $term,
      types: [ARTICLE],
      first: 8,
    ) {
      nodes {
        ...on Article {
          ...SearchArticle
        }
      }
    }
    pages: search(
      query: $term,
      types: [PAGE],
      first: 8,
    ) {
      nodes {
        ...on Page {
          ...SearchPage
        }
      }
    }
    products: search(
      after: $endCursor,
      before: $startCursor,
      first: $first,
      last: $last,
      query: $term,
      sortKey: $sortKey,
      reverse: $reverse,
      productFilters: $productFilters,
      types: [PRODUCT],
      unavailableProducts: LAST,
    ) {
      totalCount
      productFilters {
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
      nodes {
        ...on Product {
          ...ProductCard
        }
      }
      pageInfo {
        hasPreviousPage
        hasNextPage
        startCursor
        endCursor
      }
    }
  }
  ${PRODUCT_CARD_FRAGMENT}
  ${SEARCH_PAGE_FRAGMENT}
  ${SEARCH_ARTICLE_FRAGMENT}
` as const;

/**
 * Regular search fetcher
 */
async function regularSearch({
  request,
  context,
}: Pick<
  Route.LoaderArgs,
  'request' | 'context'
>): Promise<RegularSearchPageData> {
  const {storefront} = context;
  const url = new URL(request.url);
  const term = String(url.searchParams.get('q') || '').trim();
  if (!term) {
    return {
      type: 'regular',
      term,
      pages: null,
      articles: null,
      listing: null,
    };
  }

  const pageBy = parseShow(url);
  const parsed = parseCollectionFilters(url);
  const sort = parseSearchSort(url);
  // "New" has no search sort key, so it is sorted on the pooled list.
  // Relevance is pooled too, so searchRank can put the product the shopper
  // actually named first (Shopify's own relevance only counts matching words).
  const relevance =
    sort.sortKey === 'RELEVANCE' && !sort.newest && !parsed.deals;
  const pooled = parsed.needsUnion || sort.newest || relevance;
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  const paginationVariables = pooled
    ? {first: 1}
    : getPaginationVariables(request, {pageBy});

  // Same shape a collection passes: single tag filters + price when the
  // API can do it alone; just the price when the pool handles the tags.
  // The facet counts in the bar come from this query either way.
  const {
    errors,
    ...items
  }: {errors?: Array<{message: string}>} & RegularSearchQuery =
    await storefront.query(SEARCH_QUERY, {
      variables: {
        ...paginationVariables,
        term,
        productFilters: parsed.filters,
        sortKey: sort.sortKey,
        reverse: sort.reverse,
      },
      cache: listingCache(storefront),
    });

  if (!items) {
    throw new Error('No search data returned from Shopify API');
  }

  const error = errors
    ? errors.map(({message}: {message: string}) => message).join(', ')
    : undefined;

  const products = items.products;
  const filterData = (products?.productFilters ?? []) as FilterData[];

  let listing: SearchListing;
  if (pooled) {
    const pool = await loadSearchPool({
      storefront,
      term,
      parsed,
      sort,
      pageBy,
      page,
    });
    listing = {mode: 'pool', filterData, ...pool};
  } else {
    // "Shipping protection" is a published product, so a search for
    // "shipping" would otherwise offer it as something to browse and buy
    // on its own. It is only ever an add-on to a real order.
    const cards = ((products?.nodes ?? []) as ProductCardFragment[])
      .filter(hasSellablePrice)
      .filter(isCatalogProduct)
      .map((card) => packCard(card));
    const total = products?.totalCount ?? cards.length;
    listing = {
      mode: 'cursor',
      products: cards,
      total,
      page: url.searchParams.has('cursor') ? page : 1,
      pageCount: Math.max(1, Math.ceil(total / pageBy)),
      pageInfo: products?.pageInfo ?? null,
      filterData,
    };
  }

  return {
    type: 'regular',
    term,
    error,
    pages: items.pages ?? null,
    articles: items.articles ?? null,
    listing,
  };
}

/** How many products one pooled search query pulls in per page. */
const POOL_FETCH_LIMIT = 250;
/** …and how many pages of that it walks at most per query. */
const POOL_MAX_PAGES = 4;

type LightNode = {
  id: string;
  handle: string;
  title: string;
  vendor?: string | null;
  tags: string[];
  createdAt: string;
  priceRange: {minVariantPrice: {amount: string}};
  compareAtPriceRange: {maxVariantPrice: {amount: string}} | null;
};

/**
 * The Storefront API ANDs every product filter and cannot sort search by
 * date or discount. So, as on collection pages (loadUnion there), several
 * colours / brands / sizes, "New" and "Deals" run one lightweight query per
 * value of the largest group, merge the results, apply the rest in memory
 * and paginate the merged list here.
 */
async function loadSearchPool({
  storefront,
  term,
  parsed,
  sort,
  pageBy,
  page,
}: {
  storefront: Route.LoaderArgs['context']['storefront'];
  term: string;
  parsed: ReturnType<typeof parseCollectionFilters>;
  sort: ReturnType<typeof parseSearchSort>;
  pageBy: number;
  page: number;
}) {
  const {colors, brands, sizes, deals, priceMin, priceMax} = parsed;

  const groups: Array<{prefix: string; values: string[]}> = [
    {prefix: 'color', values: colors},
    {prefix: 'brand', values: brands},
    {prefix: 'size', values: sizes},
  ].filter((group) => group.values.length > 0);

  const priceFilter: ProductFilter[] =
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

  const unionGroup =
    groups
      .filter((group) => group.values.length > 1)
      .sort((a, b) => b.values.length - a.values.length)[0] ?? null;
  const singleFilters = groups
    .filter((group) => group !== unionGroup && group.values.length === 1)
    .map((group) => ({tag: tagFor(group.prefix, group.values[0])}));
  const postGroups = groups.filter(
    (group) => group !== unionGroup && group.values.length > 1,
  );

  const queryVariants: ProductFilter[][] = unionGroup
    ? unionGroup.values.map((value) => [
        {tag: tagFor(unionGroup.prefix, value)},
        ...singleFilters,
        ...priceFilter,
      ])
    : [[...singleFilters, ...priceFilter]];

  const results = await Promise.all(
    queryVariants.map((productFilters) =>
      fetchAllSearchPages(storefront, term, productFilters, sort),
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

  pool = pool.filter((node) => priceOf(node) > 0 && isCatalogProduct(node));

  for (const group of postGroups) {
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

  if (!deals && !sort.newest && sort.sortKey === 'RELEVANCE') {
    pool = rankByTerm(pool, term, (node) => `${node.vendor ?? ''} ${node.title}`);
  }

  // Several queries were merged, so re-apply the order the shopper chose;
  // relevance is kept as returned (first query's order first).
  if (deals) {
    pool.sort((a, b) => discountOf(b) - discountOf(a));
  } else if (sort.newest) {
    pool.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  } else if (sort.sortKey === 'PRICE') {
    pool.sort((a, b) => {
      const delta = priceOf(a) - priceOf(b);
      return sort.reverse ? -delta : delta;
    });
  }

  const total = pool.length;
  const pageCount = Math.max(1, Math.ceil(total / pageBy));
  const currentPage = Math.min(page, pageCount);
  const slice = pool.slice((currentPage - 1) * pageBy, currentPage * pageBy);

  let products: PackedProductCard[] = [];
  if (slice.length > 0) {
    const {nodes} = await storefront.query(SEARCH_PRODUCTS_BY_IDS_QUERY, {
      variables: {ids: slice.map((node) => node.id)},
      cache: listingCache(storefront),
    });
    products = ((nodes ?? []).filter(Boolean) as ProductCardFragment[]).map(
      (card) => packCard(card),
    );
  }

  return {products, total, page: currentPage, pageCount, truncated};
}

async function fetchAllSearchPages(
  storefront: Route.LoaderArgs['context']['storefront'],
  term: string,
  productFilters: ProductFilter[],
  sort: ReturnType<typeof parseSearchSort>,
): Promise<{nodes: LightNode[]; truncated: boolean}> {
  const nodes: LightNode[] = [];
  let after: string | null = null;

  for (let index = 0; index < POOL_MAX_PAGES; index++) {
    const response: any = await storefront.query(SEARCH_POOL_QUERY, {
      variables: {
        term,
        productFilters,
        sortKey: sort.sortKey,
        reverse: sort.reverse,
        first: POOL_FETCH_LIMIT,
        after,
      },
      cache: listingCache(storefront),
    });
    const products = response?.products;
    nodes.push(
      ...((products?.nodes ?? []) as Array<LightNode | Record<string, never>>)
        .filter((node): node is LightNode => 'id' in node),
    );
    if (!products?.pageInfo?.hasNextPage) {
      return {nodes, truncated: false};
    }
    after = products.pageInfo.endCursor as string;
  }

  return {nodes, truncated: true};
}

/** Brand rows can be a house, a silhouette, a collab or a garment. */
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

/** Lightweight pass for the pooled path: enough to merge, filter and sort. */
const SEARCH_POOL_QUERY = `#graphql
  query SearchPool(
    $term: String!
    $productFilters: [ProductFilter!]
    $sortKey: SearchSortKeys
    $reverse: Boolean
    $first: Int!
    $after: String
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    products: search(
      query: $term
      types: [PRODUCT]
      first: $first
      after: $after
      productFilters: $productFilters
      sortKey: $sortKey
      reverse: $reverse
      unavailableProducts: LAST
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ... on Product {
          id
          handle
          title
          vendor
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

/** Full card data for just the products on the current pooled page. */
const SEARCH_PRODUCTS_BY_IDS_QUERY = `#graphql
  ${PRODUCT_CARD_FRAGMENT}
  query SearchProductsByIds(
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

/**
 * Predictive search query and fragments
 * (adjust as needed)
 */
const PREDICTIVE_SEARCH_ARTICLE_FRAGMENT = `#graphql
  fragment PredictiveArticle on Article {
    __typename
    id
    title
    handle
    blog {
      handle
    }
    image {
      url
      altText
      width
      height
    }
    trackingParameters
  }
` as const;

const PREDICTIVE_SEARCH_COLLECTION_FRAGMENT = `#graphql
  fragment PredictiveCollection on Collection {
    __typename
    id
    title
    handle
    image {
      url
      altText
      width
      height
    }
    trackingParameters
  }
` as const;

const PREDICTIVE_SEARCH_PAGE_FRAGMENT = `#graphql
  fragment PredictivePage on Page {
    __typename
    id
    title
    handle
    trackingParameters
  }
` as const;

const PREDICTIVE_SEARCH_PRODUCT_FRAGMENT = `#graphql
  fragment PredictiveProduct on Product {
    __typename
    id
    title
    vendor
    handle
    trackingParameters
    selectedOrFirstAvailableVariant(
      selectedOptions: []
      ignoreUnknownOptions: true
      caseInsensitiveMatch: true
    ) {
      id
      image {
        url
        altText
        width
        height
      }
      price {
        amount
        currencyCode
      }
      compareAtPrice {
        amount
        currencyCode
      }
    }
  }
` as const;

const PREDICTIVE_SEARCH_QUERY_FRAGMENT = `#graphql
  fragment PredictiveQuery on SearchQuerySuggestion {
    __typename
    text
    styledText
    trackingParameters
  }
` as const;

// NOTE: https://shopify.dev/docs/api/storefront/latest/queries/predictiveSearch
const PREDICTIVE_SEARCH_QUERY = `#graphql
  query PredictiveSearch(
    $country: CountryCode
    $language: LanguageCode
    $limit: Int!
    $limitScope: PredictiveSearchLimitScope!
    $term: String!
    $types: [PredictiveSearchType!]
  ) @inContext(country: $country, language: $language) {
    predictiveSearch(
      limit: $limit,
      limitScope: $limitScope,
      query: $term,
      types: $types,
    ) {
      articles {
        ...PredictiveArticle
      }
      collections {
        ...PredictiveCollection
      }
      pages {
        ...PredictivePage
      }
      products {
        ...PredictiveProduct
      }
      queries {
        ...PredictiveQuery
      }
    }
  }
  ${PREDICTIVE_SEARCH_ARTICLE_FRAGMENT}
  ${PREDICTIVE_SEARCH_COLLECTION_FRAGMENT}
  ${PREDICTIVE_SEARCH_PAGE_FRAGMENT}
  ${PREDICTIVE_SEARCH_PRODUCT_FRAGMENT}
  ${PREDICTIVE_SEARCH_QUERY_FRAGMENT}
` as const;

/**
 * Predictive search only returns 10 products and ranks by "typed as you go"
 * prefix matching, so a full product name ("ASICS Gel-Kayano 14 Triple
 * White") often misses the exact product. The dropdown therefore also runs
 * the normal product search (same engine as the results page) and merges.
 */
const DROPDOWN_PRODUCTS_BY_IDS_QUERY = `#graphql
  query DropdownProductsByIds(
    $country: CountryCode
    $language: LanguageCode
    $ids: [ID!]!
  ) @inContext(country: $country, language: $language) {
    nodes(ids: $ids) {
      ...PredictiveProduct
    }
  }
  ${PREDICTIVE_SEARCH_PRODUCT_FRAGMENT}
` as const;

/**
 * Predictive search fetcher
 */
async function predictiveSearch({
  request,
  context,
}: Pick<
  Route.ActionArgs,
  'request' | 'context'
>): Promise<PredictiveSearchReturn> {
  const {storefront} = context;
  const url = new URL(request.url);
  const term = String(url.searchParams.get('q') || '').trim();
  const limit = Number(url.searchParams.get('limit') || 10);
  // Ask for the API maximum (10) and re-rank, so a shopper who types a full
  // product name sees that product even when Shopify ranks it low.
  const fetchLimit = 10;
  const type = 'predictive';

  if (!term) return {type, term, result: getEmptyPredictiveSearchResult()};

  // Predictively search articles, collections, pages, products, and queries (suggestions)
  const [predictive, poolResponse] = await Promise.all([
    storefront.query(PREDICTIVE_SEARCH_QUERY, {
      variables: {
        // customize search options as needed
        limit: fetchLimit,
        limitScope: 'EACH',
        term,
      },
    }) as Promise<PredictiveSearchQuery & {errors?: Array<{message: string}>}>,
    // The same product search the results page pools from (one page of 250,
    // cached), so the dropdown can find what "Enter" would find.
    (
      storefront.query(SEARCH_POOL_QUERY, {
        variables: {
          term,
          productFilters: [],
          sortKey: 'RELEVANCE',
          reverse: false,
          first: POOL_FETCH_LIMIT,
          after: null,
        },
        cache: listingCache(storefront),
      }) as Promise<any>
    ).catch((error: unknown) => {
      console.error('[search] dropdown pool failed', error);
      return null;
    }),
  ]);
  const {predictiveSearch: items, errors} = predictive;

  if (errors) {
    throw new Error(
      `Shopify API errors: ${errors.map(({message}: {message: string}) => message).join(', ')}`,
    );
  }

  if (!items) {
    throw new Error('No predictive search data returned from Shopify API');
  }

  // Same exclusion as the full results above — the suggestions dropdown
  // reads from a separate query, so it needs its own filter.
  if (Array.isArray(items.products)) {
    type Candidate = {id: string; title: string; vendor?: string | null};
    const byId = new Map<string, (typeof items.products)[number]>();
    const candidates: Candidate[] = [];
    for (const product of items.products.filter(isCatalogProduct)) {
      byId.set(product.id, product);
      candidates.push(product as Candidate);
    }
    const poolNodes = ((poolResponse?.products?.nodes ?? []) as Array<
      LightNode | Record<string, never>
    >)
      .filter((node): node is LightNode => 'id' in node)
      .filter((node) => isCatalogProduct(node) && priceOf(node) > 0);
    for (const node of poolNodes) {
      if (!byId.has(node.id) && !candidates.some((c) => c.id === node.id)) {
        candidates.push(node);
      }
    }
    const top = rankByTerm(
      candidates,
      term,
      (candidate) => `${candidate.vendor ?? ''} ${candidate.title}`,
    ).slice(0, limit);
    const missing = top.map((c) => c.id).filter((id) => !byId.has(id));
    if (missing.length) {
      try {
        const extra: any = await storefront.query(
          DROPDOWN_PRODUCTS_BY_IDS_QUERY,
          {variables: {ids: missing}},
        );
        for (const node of extra?.nodes ?? []) {
          if (node?.id) byId.set(node.id, node);
        }
      } catch (error) {
        console.error('[search] dropdown card fetch failed', error);
      }
    }
    items.products = top
      .map((c) => byId.get(c.id))
      .filter((product): product is NonNullable<typeof product> =>
        Boolean(product),
      );
  }
  // Everything else back to the size the dropdown asked for.
  for (const key of ['articles', 'collections', 'pages', 'queries'] as const) {
    if (Array.isArray(items[key])) {
      (items as Record<string, unknown[]>)[key] = items[key].slice(0, limit);
    }
  }

  const total = Object.values(items).reduce(
    (acc: number, item: Array<unknown>) => acc + item.length,
    0,
  );

  return {type, term, result: {items, total}};
}
