import {Link, redirect, useLoaderData} from 'react-router';
import type {Route} from './+types/($locale).product-index.($page)';
import {useLocalizedHref} from '~/lib/localizedLink';
import {buildMeta} from '~/lib/seo';
import {useTranslate} from '~/lib/useTranslate';

/**
 * A plain, numbered index of every product: `/product-index`, then
 * `/product-index/2` … `/product-index/N`.
 *
 * Why this exists:
 *
 * Search Console's "Discovered – currently not indexed" sat at 7,279 URLs on
 * 2026-09-20, 978 of the 1,000 sampled being products Google had never once
 * fetched. They were all in the sitemap, so Google knew of them; what they
 * lacked was a reason to be fetched. The only internal links to most products
 * are on collection pages, which are prev/next chains over opaque cursors —
 * `/collections/all` is ~400 pages deep and the big brands run past 100 — so
 * a product on page 60 is sixty sequential fetches from anything Google
 * already trusts. A URL that is only in the sitemap and sixty hops deep is
 * exactly what "discovered, not crawled" describes.
 *
 * This puts every product three clicks from the homepage: footer ->
 * index -> page N -> product. Every page links to every other page, so there
 * is no chain to walk.
 *
 * How it pages without cursors:
 *
 * The Storefront API's `sitemap` field is the one product listing addressable
 * by page NUMBER (250 per page), which is what makes a numbered pager
 * possible at all. Its pages are sparse, though — ranges of deleted products
 * leave empty ones behind (pages 1–3 of 42 at the time of writing, from the
 * catalogue that was replaced in September). Linking to empty pages would
 * hand Google thin URLs, so one cached query maps out which sitemap pages
 * hold anything, and the index numbers only those: index page 1 is the first
 * NON-EMPTY sitemap page.
 *
 * Both queries are cached long. The catalogue changes a few times a day at
 * most and nothing here is personal, so a crawl of all ~40 pages costs the
 * Storefront API almost nothing.
 */

export const meta: Route.MetaFunction = ({data, matches, location}) => {
  const page = data?.page ?? 1;
  const pageCount = data?.pageCount ?? 1;
  const first = data?.products?.[0]?.title;
  const last = data?.products?.[data.products.length - 1]?.title;

  return buildMeta(
    {matches, pathname: location.pathname},
    {
      title:
        page > 1
          ? `All products – page ${page} of ${pageCount}`
          : 'All products – full index',
      description:
        first && last
          ? `Every sneaker, slipper, boot and streetwear piece we stock, listed by name. This page: ${first} to ${last}.`
          : 'Every sneaker, slipper, boot and streetwear piece we stock, listed by name.',
    },
  );
};

export async function loader({context, params, request}: Route.LoaderArgs) {
  const {storefront} = context;

  // `/product-index/1` and junk like `/product-index/abc` are not pages of
  // their own. Page one lives at the bare path.
  const raw = params.page;
  const page = raw === undefined ? 1 : Number(raw);
  if (!Number.isInteger(page) || page < 1 || String(page) !== (raw ?? '1')) {
    throw new Response('Not found', {status: 404});
  }
  if (raw !== undefined && page === 1) {
    const url = new URL(request.url);
    throw redirect(url.pathname.replace(/\/1\/?$/, '') + url.search, 301);
  }

  // Which sitemap pages hold products. Handles only — this is a map, and the
  // titles are fetched for one page at a time below.
  const {sitemap: shape} = await storefront.query(SITEMAP_SHAPE_QUERY, {
    cache: storefront.CacheLong(),
  });
  const sitemapPages = shape?.pagesCount?.count ?? 0;
  if (!sitemapPages) throw new Response('Not found', {status: 404});

  const map = await storefront.query(sitemapMapQuery(sitemapPages), {
    cache: storefront.CacheLong(),
  });
  const nonEmpty: number[] = [];
  for (let index = 1; index <= sitemapPages; index += 1) {
    const items = (
      map as Record<string, {resources?: {items?: unknown[]} | null} | null>
    )[`p${index}`]?.resources?.items;
    if (items?.length) nonEmpty.push(index);
  }

  const sitemapPage = nonEmpty[page - 1];
  if (!sitemapPage) throw new Response('Not found', {status: 404});

  const {sitemap} = await storefront.query(SITEMAP_PAGE_QUERY, {
    variables: {page: sitemapPage},
    cache: storefront.CacheLong(),
  });

  const products = (sitemap?.resources?.items ?? [])
    .map((item) => ({
      handle: item.handle,
      title: ('title' in item && item.title) || item.handle,
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'en', {numeric: true}));

  return {page, pageCount: nonEmpty.length, products};
}

export default function ProductIndex() {
  const {page, pageCount, products} = useLoaderData<typeof loader>();
  const localize = useLocalizedHref();
  const t = useTranslate();

  const pageHref = (target: number) =>
    localize(target === 1 ? '/product-index' : `/product-index/${target}`);

  return (
    <div className="page-container product-index">
      <header className="page-header">
        <h1>{t('All products')}</h1>
        <p>
          {t(
            'Every product we stock, listed by name. Looking for something specific? The search and the collections are faster — this page is the complete list.',
          )}
        </p>
      </header>

      <IndexPager page={page} pageCount={pageCount} hrefFor={pageHref} />

      <ul className="product-index-list">
        {products.map((product) => (
          <li key={product.handle}>
            <Link to={localize(`/products/${product.handle}`)} prefetch="none">
              {product.title}
            </Link>
          </li>
        ))}
      </ul>

      <IndexPager page={page} pageCount={pageCount} hrefFor={pageHref} />

      <p className="product-index-more">
        <Link to={localize('/collections/all')}>{t('Shop all products')}</Link>
        {' · '}
        <Link to={localize('/collections')}>{t('Collections')}</Link>
      </p>
    </div>
  );
}

/**
 * Every page number, always. A windowed pager ("1 2 3 … 39") would bring the
 * chain back: the point is that any page reaches any other in one hop.
 */
function IndexPager({
  page,
  pageCount,
  hrefFor,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav className="product-index-pager" aria-label="Product index pages">
      {Array.from({length: pageCount}, (_, index) => index + 1).map((target) =>
        target === page ? (
          <span key={target} aria-current="page">
            {target}
          </span>
        ) : (
          <Link key={target} to={hrefFor(target)} prefetch="none">
            {target}
          </Link>
        ),
      )}
    </nav>
  );
}

const SITEMAP_SHAPE_QUERY = `#graphql
  query ProductIndexShape {
    sitemap(type: PRODUCT) {
      pagesCount {
        count
      }
    }
  }
` as const;

const SITEMAP_PAGE_QUERY = `#graphql
  query ProductIndexPage($page: Int!) {
    sitemap(type: PRODUCT) {
      resources(page: $page) {
        items {
          handle
          ... on SitemapResource {
            title
          }
        }
      }
    }
  }
` as const;

/**
 * One aliased field per sitemap page. Built at request time because the page
 * count is data, so it cannot go through codegen — hence the loose typing
 * where the result is read.
 */
function sitemapMapQuery(pages: number): string {
  const fields = Array.from(
    {length: pages},
    (_, index) =>
      `p${index + 1}: sitemap(type: PRODUCT) { resources(page: ${
        index + 1
      }) { items { handle } } }`,
  ).join('\n');
  // No `#graphql` marker: codegen would try to parse the interpolation.
  return `query ProductIndexMap {\n${fields}\n}`;
}
