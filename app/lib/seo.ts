import {getSeoMeta, type SeoConfig} from '@shopify/hydrogen';
import {SHOP} from '~/data/shop';
import {SUPPORTED_LOCALES} from '~/lib/i18n';

interface MetaMatch {
  id: string;
  data?: unknown;
}

type MetaMatches = ReadonlyArray<MetaMatch | undefined>;

export interface BuildMetaInput {
  /** Page part of the title; combined as `{title} | {shop name}`. */
  title: string;
  description?: string | null;
  /** Emit a robots noindex/nofollow meta (cart, search, favorites, account). */
  noindex?: boolean;
  ogType?: 'website' | 'product' | 'article';
  /** Absolute image URL for social sharing (og:image). */
  image?: string | null;
  jsonLd?: SeoConfig['jsonLd'];
  /** Override the default '%s | {shop name}' template (homepage passes '%s'). */
  titleTemplate?: string;
  /**
   * Query string to keep in the canonical URL, including the leading `?`.
   * Only paginated listings pass this — see `paginationCanonical`.
   */
  canonicalSearch?: string;
}

/**
 * Collapses a currency variant onto its language's canonical URL.
 *
 * The storefront has 7 languages x 23 currencies = 161 locales, so each page
 * is *addressable* at 161 URLs and before this they all self-canonicalised,
 * because the canonical was simply `origin + pathname`.
 *
 * Note: they are addressable, not crawlable. An earlier version of this
 * comment claimed the country selector renders an <a href> to all 161 and
 * that Google therefore sees ~1.5M product URLs. That was wrong —
 * `LocaleItem` in CountrySelector is a <button> driving `useNavigate()`, and
 * no anchor anywhere is built from `pathPrefix`. The only locale URLs Google
 * can discover are the 7 in the sitemap.
 *
 * Only 7 of those are in the sitemap: `($locale).sitemap.$type.$page[.xml]`
 * already advertises one locale per LANGUAGE, on the reasoning that
 * "currency variants of the same language serve identical content". That is
 * correct, and this makes the canonical tag say the same thing — the two
 * were contradicting each other.
 *
 * `/de-ch/products/x` and `/de-de/products/x` are the same German page with
 * a different price format, so both now canonicalise to `/de-de/products/x`.
 * EN + EUR is the default locale and lives un-prefixed, so English currency
 * variants collapse to the bare path.
 */
export function canonicalPathname(pathname: string): string {
  const firstSegment = `/${pathname.split('/')[1]?.toLowerCase() ?? ''}`;
  const current = SUPPORTED_LOCALES.find(
    (locale) => locale.pathPrefix && locale.pathPrefix === firstSegment,
  );

  // No prefix at all: already the default locale's canonical URL.
  if (!current) return pathname;
  // Already the language's advertised (EUR) locale.
  if (current.currency === 'EUR') return pathname;

  const canonicalLocale = SUPPORTED_LOCALES.find(
    (locale) => locale.language === current.language && locale.currency === 'EUR',
  );
  if (!canonicalLocale) return pathname;

  const rest = pathname.slice(current.pathPrefix.length);
  // `/de-ch` -> `/de-de`, not `/de-de/`.
  if (!rest || rest === '/') return canonicalLocale.pathPrefix || '/';
  return canonicalLocale.pathPrefix + rest;
}

/**
 * Which part of a listing's query string belongs in its canonical URL.
 *
 * The canonical used to be `origin + pathname` for every route, which is
 * right everywhere except a paginated listing: page 2, 3, … 9 of a
 * collection all declared page 1 as their canonical. That tells Google the
 * deeper pages are duplicates of the first, so it drops them — and with them
 * every product link they carry. A product past page one of its collections
 * was left with the sitemap and the shuffled recommendation rails as its
 * only ways in, and no stable listing link at all — which is the textbook
 * profile of "Discovered – currently not indexed" (7,279 URLs in
 * the 2026-09-20 export, 978 of the 1,000 sampled being products, none ever
 * crawled). Google's own pagination guidance is explicit: give each page its
 * own URL and do not canonicalise them to the first.
 *
 * So a page reached through the pager canonicalises to itself, keeping
 * exactly the three params the pager writes, in a fixed order.
 *
 * Everything else still collapses onto the bare path, deliberately:
 *   - filters, `sort_by`, `show` — same products in another order or subset;
 *     a filtered view that is also paginated is still a filtered view.
 *   - `?page=2` with no cursor — the loader ignores `page` without a cursor
 *     and serves page one, so that URL really is a duplicate of page one.
 */
export function paginationCanonical(search: string): {
  search: string;
  page: number;
} {
  const params = new URLSearchParams(search);
  const cursor = params.get('cursor');
  const page = Number(params.get('page') ?? '1') || 1;
  if (!cursor || page <= 1) return {search: '', page: 1};

  for (const key of params.keys()) {
    if (key !== 'page' && key !== 'cursor' && key !== 'direction') {
      return {search: '', page: 1};
    }
  }

  const kept = new URLSearchParams();
  kept.set('page', String(page));
  kept.set('cursor', cursor);
  kept.set(
    'direction',
    params.get('direction') === 'previous' ? 'previous' : 'next',
  );
  return {search: `?${kept.toString()}`, page};
}

/** The absolute origin the root loader resolved, or '' when unavailable. */
export function originFrom(matches: MetaMatches): string {
  const rootData = matches.find((match) => match?.id === 'root')?.data as
    | {origin?: string}
    | undefined;
  return rootData?.origin ?? '';
}

/**
 * The locale prefix of a pathname (`/de-de/collections/x` -> `/de-de`), or ''
 * for the default locale. Used to keep JSON-LD item URLs on the same locale
 * as the page that lists them.
 */
export function localePrefixOf(pathname: string): string {
  const firstSegment = `/${pathname.split('/')[1]?.toLowerCase() ?? ''}`;
  const match = SUPPORTED_LOCALES.find(
    (locale) => locale.pathPrefix && locale.pathPrefix === firstSegment,
  );
  return match?.pathPrefix ?? '';
}

/**
 * Builds the meta descriptors for a route: title/description, a canonical
 * `<link>` (absolute, keeps the market prefix), Open Graph + Twitter tags and
 * optional JSON-LD. Wraps Hydrogen's `getSeoMeta`, which emits the canonical
 * with `tagName: 'link'` and renders JSON-LD CSP-safe via `script:ld+json`.
 *
 * Usage in a route:
 *   export const meta: Route.MetaFunction = ({data, matches, location}) =>
 *     buildMeta({matches, pathname: location.pathname}, {title: '...', ...});
 */
export function buildMeta(
  {matches, pathname}: {matches: MetaMatches; pathname: string},
  input: BuildMetaInput,
) {
  const origin = originFrom(matches);

  const seoMeta =
    getSeoMeta({
      title: input.title,
      titleTemplate: input.titleTemplate ?? `%s | ${SHOP.name}`,
      description: truncate(input.description ?? undefined, 155),
      url: origin ? origin + canonicalPathname(pathname) : undefined,
      media: input.image ?? undefined,
      jsonLd: input.jsonLd,
      robots: input.noindex ? {noIndex: true, noFollow: true} : undefined,
    }) ?? [];

  // `getSeoMeta` cuts the URL at the first `?` before it writes the canonical
  // and og:url — passing the query string in `url` does nothing. The search
  // part has to be put back on the finished descriptors.
  const search = input.canonicalSearch ?? '';
  const withCanonicalSearch = search
    ? seoMeta.map((tag) => {
        if ('rel' in tag && tag.rel === 'canonical' && 'href' in tag) {
          return {...tag, href: `${String(tag.href)}${search}`};
        }
        if ('property' in tag && tag.property === 'og:url' && 'content' in tag) {
          return {...tag, content: `${String(tag.content)}${search}`};
        }
        return tag;
      })
    : seoMeta;

  return [
    ...withCanonicalSearch,
    {property: 'og:type', content: input.ogType ?? 'website'},
    {property: 'og:site_name', content: SHOP.name},
    {
      name: 'twitter:card',
      content: input.image ? 'summary_large_image' : 'summary',
    },
  ];
}

function truncate(value: string | undefined, max: number): string | undefined {
  if (!value) return value;
  if (value.length <= max) return value;
  return value.slice(0, max - 1).trimEnd() + '…';
}

/**
 * JSON-LD for a collection page.
 *
 * Collection pages carried no structured data at all, while product pages
 * have had Product + Offer + Brand + BreadcrumbList since launch. Collections
 * are the pages that compete for the head terms ("travis scott sneakers",
 * "new balance 9060"), so leaving them bare was the bigger omission.
 *
 * Three graphs are emitted:
 *
 *   CollectionPage   — what this page is, with its canonical URL.
 *   ItemList         — the products actually rendered, in display order.
 *   BreadcrumbList   — Home > Shop > {collection}, matching the product page.
 *
 * The ItemList carries `item` as a nested Product with an Offer rather than a
 * bare URL. Google accepts both; the nested form is what makes a listing
 * eligible for the merchant carousel treatment, and the price is already in
 * the payload so it costs nothing to include.
 *
 * Item URLs keep the page's own locale prefix, because that is the URL a
 * visitor on this page would actually follow. The prefix is taken from the
 * CANONICAL pathname, so a currency variant (`/de-ch/...`) points at the
 * language's canonical URL (`/de-de/...`) rather than at itself.
 */
export function collectionJsonLd(input: {
  origin: string;
  /** Canonical pathname of the collection page, from `canonicalPathname()`. */
  canonicalPath: string;
  title: string;
  description?: string | null;
  products: ReadonlyArray<{
    handle?: string | null;
    title?: string | null;
    featuredImage?: {url?: string | null} | null;
    priceRange?: {
      minVariantPrice?: {
        amount?: string | null;
        currencyCode?: string | null;
      } | null;
    } | null;
  }>;
  /** How many products to list. Keeps the payload off very long pages. */
  limit?: number;
}) {
  const {origin, canonicalPath, title, description, products} = input;
  if (!origin) return undefined;

  const url = origin + canonicalPath;
  const prefix = localePrefixOf(canonicalPath);
  const listed = products
    .filter((product) => product?.handle)
    .slice(0, input.limit ?? 24);

  const itemList = listed.map((product, index) => {
    const price = product.priceRange?.minVariantPrice;
    return {
      '@type': 'ListItem' as const,
      position: index + 1,
      item: {
        '@type': 'Product' as const,
        name: product.title ?? undefined,
        url: `${origin}${prefix}/products/${product.handle}`,
        image: product.featuredImage?.url ?? undefined,
        offers: price?.amount
          ? {
              '@type': 'Offer' as const,
              price: price.amount,
              priceCurrency: price.currencyCode ?? undefined,
            }
          : undefined,
      },
    };
  });

  return [
    {
      '@context': 'https://schema.org' as const,
      '@type': 'CollectionPage' as const,
      name: title,
      description: truncate(description ?? undefined, 300) ?? undefined,
      url,
    },
    ...(itemList.length
      ? [
          {
            '@context': 'https://schema.org' as const,
            '@type': 'ItemList' as const,
            name: title,
            numberOfItems: itemList.length,
            itemListElement: itemList,
          },
        ]
      : []),
    {
      '@context': 'https://schema.org' as const,
      '@type': 'BreadcrumbList' as const,
      itemListElement: [
        {
          '@type': 'ListItem' as const,
          position: 1,
          name: 'Home',
          item: `${origin}${prefix}/`,
        },
        {
          '@type': 'ListItem' as const,
          position: 2,
          name: 'Shop',
          item: `${origin}${prefix}/collections/all`,
        },
        {
          '@type': 'ListItem' as const,
          position: 3,
          name: title,
          item: url,
        },
      ],
    },
  ];
}
