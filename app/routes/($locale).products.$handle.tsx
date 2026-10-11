import {Suspense, useRef} from 'react';
import {
  Await,
  Link,
  isRouteErrorResponse,
  redirect,
  useLoaderData,
  useLocation,
  useRouteError,
} from 'react-router';
import {isSameOptionAxis} from '~/lib/options';
import type {Route} from './+types/($locale).products.$handle';
import type {
  ProductCardFragment,
  ProductRecommendationsQuery,
} from 'storefrontapi.generated';
import {ProductsRail} from '~/components/ProductsRail';
import {
  getSelectedProductOptions,
  Analytics,
  useOptimisticVariant,
  getProductOptions,
  getAdjacentAndFirstAvailableVariants,
  useSelectedOptionInUrlParam,
} from '@shopify/hydrogen';
import {ReviewBadge} from '~/components/ReviewBadge';
import {ProductPrice} from '~/components/ProductPrice';
import {ProductGallery} from '~/components/ProductGallery';
import {ProductForm} from '~/components/ProductForm';
import {ProductItem} from '~/components/ProductItem';
import {FavoriteButton} from '~/components/FavoriteButton';
import {redirectIfHandleIsLocalized} from '~/lib/redirect';
import {useLocalizedHref} from '~/lib/localizedLink';
import {buildMeta} from '~/lib/seo';
import {PRODUCT_CARD_FRAGMENT} from '~/lib/productCardFragment';
import {
  brandFromTitle,
  brandTagSlug,
  cardVendor,
  displayVendor,
} from '~/lib/brand';
import {brandLabel, displayTypeLabel} from '~/lib/filters';
import {SHOP} from '~/data/shop';
import {CustomerLove, InstaStrip} from '~/components/SocialProof';
import {PaymentIcons} from '~/components/PaymentIcons';
import {TrustStories} from '~/components/TrustStories';
import {ShopVideos} from '~/components/ShopVideos';
import {KlarnaLine} from '~/components/KlarnaLine';
import {useTranslate} from '~/lib/useTranslate';
import {listingCache, railCache} from '~/lib/cache';

export const meta: Route.MetaFunction = ({data, matches, location}) => {
  const product = data?.product;
  const variant = product?.selectedOrFirstAvailableVariant;
  const image = variant?.image?.url ?? product?.featuredImage?.url ?? null;
  const title = product?.seo?.title ?? product?.title ?? 'Product';
  const description = product?.seo?.description ?? product?.description;

  const rootData = matches.find((match) => match?.id === 'root')?.data as
    {origin?: string} | undefined;
  const origin = rootData?.origin ?? '';

  const jsonLd = product
    ? [
        {
          '@context': 'https://schema.org' as const,
          '@type': 'Product' as const,
          name: product.title,
          description: description ?? undefined,
          image: image ?? undefined,
          // The PRODUCT's brand — UGG, Nike, Denim Tears — never the store.
          // `product.vendor` is our own shop name on every imported product,
          // so `displayVendor()` was telling Google that Vespera Collectives
          // manufactures 9,600 different sneakers. Same resolution the
          // visible Brand spec uses: a real third-party vendor first, else
          // derived from the title.
          brand: (cardVendor(product.vendor) ??
            brandFromTitle(product.title)?.label)
            ? {
                '@type': 'Brand' as const,
                name:
                  cardVendor(product.vendor) ??
                  brandFromTitle(product.title)?.label,
              }
            : undefined,
          sku: variant?.sku ?? undefined,
          // Every listing is stated as "Brand new, unworn, in original
          // packaging" in the description and in the Merchant Center feed.
          itemCondition: 'https://schema.org/NewCondition' as const,
          offers: variant
            ? {
                '@type': 'Offer' as const,
                price: variant.price?.amount,
                priceCurrency: variant.price?.currencyCode,
                availability: variant.availableForSale
                  ? 'https://schema.org/InStock'
                  : 'https://schema.org/OutOfStock',
                itemCondition: 'https://schema.org/NewCondition' as const,
                url: origin ? origin + location.pathname : undefined,
              }
            : undefined,
        },
        {
          '@context': 'https://schema.org' as const,
          '@type': 'BreadcrumbList' as const,
          itemListElement: [
            {
              '@type': 'ListItem' as const,
              position: 1,
              name: 'Home',
              item: origin ? `${origin}/` : undefined,
            },
            {
              '@type': 'ListItem' as const,
              position: 2,
              name: 'Shop',
              item: origin ? `${origin}/collections/all` : undefined,
            },
            {
              '@type': 'ListItem' as const,
              position: 3,
              name: product.title,
            },
          ],
        },
      ]
    : undefined;

  return buildMeta(
    {matches, pathname: location.pathname},
    {
      title,
      description,
      ogType: 'product',
      image,
      jsonLd: jsonLd as never,
    },
  );
};

export async function loader(args: Route.LoaderArgs) {
  // Start fetching non-critical data without blocking time to first byte
  const deferredData = loadDeferredData(args);

  // Await the critical data required to render initial state of the page
  const criticalData = await loadCriticalData(args);

  // Oxygen's geo header. Only used to pick the Klarna wording under the
  // price (instalments are not offered in every country) — see ~/lib/klarna.
  const buyerCountry = args.request.headers.get('oxygen-buyer-country');

  return {...deferredData, ...criticalData, buyerCountry};
}

/**
 * 301 a URL written against an option name the product no longer uses.
 *
 * The catalogue's size option is named "Maat" — normalize-options.mjs
 * standardised on it deliberately, because Shopify builds one filter per
 * option NAME and the imported catalogue had it split across Maat / Mate /
 * Size / Schoenmaat. Merchant Center wants it called "Size", so that rename
 * is likely at some point.
 *
 * The danger in renaming is not the UI — `displayOptionName` already maps
 * every spelling onto one label, so picker, cart and filters are
 * name-agnostic. It is the URLs. This route writes the selected option into
 * the query string, so links in the wild look like `?Maat=42+EU`. After a
 * rename those match no option, and `ignoreUnknownOptions: true` makes the
 * page quietly fall back to the first available variant — worse than a 404,
 * because the shopper lands on the wrong size and nobody notices.
 *
 * This closes that gap ahead of time, and is a no-op until the rename
 * happens: it only rewrites a param when the product has no option by that
 * name AND has one meaning the same axis. A product still using "Maat" keeps
 * working untouched.
 */
function redirectLegacyOptionParams(
  request: Request,
  product: {options?: Array<{name: string}> | null},
) {
  const optionNames = (product.options ?? []).map((option) => option.name);
  if (!optionNames.length) return;

  const url = new URL(request.url);
  let rewritten = false;

  for (const [key, value] of [...url.searchParams.entries()]) {
    // Already matches a real option name — nothing to repair.
    if (optionNames.includes(key)) continue;
    const current = optionNames.find((name) => isSameOptionAxis(name, key));
    if (!current) continue;
    url.searchParams.delete(key);
    url.searchParams.set(current, value);
    rewritten = true;
  }

  if (rewritten) throw redirect(url.pathname + url.search, 301);
}

/**
 * Load data necessary for rendering content above the fold. This is the critical data
 * needed to render the page. If it's unavailable, the whole page should 400 or 500 error.
 */
async function loadCriticalData({context, params, request}: Route.LoaderArgs) {
  const {handle} = params;
  const {storefront} = context;

  if (!handle) {
    throw new Error('Expected product handle to be defined');
  }

  const [{product}] = await Promise.all([
    storefront.query(PRODUCT_QUERY, {
      variables: {handle, selectedOptions: getSelectedProductOptions(request)},
    }),
    // Add other queries here, so that they are loaded in parallel
  ]);

  if (!product?.id) {
    throw new Response(null, {status: 404});
  }

  // Repair `?Maat=` style links before anything reads the selection.
  redirectLegacyOptionParams(request, product);

  // The API handle might be localized, so redirect to the localized handle
  redirectIfHandleIsLocalized(request, {handle, data: product});

  return {
    product,
    // Streamed below the fold — each rail resolves on its own.
    ...buildRails(storefront, product),
  };
}

/** Popular houses the "Sponsored by brands" rail rotates through. */
const SPONSOR_POOL = [
  'nike',
  'jordan',
  'new-balance',
  'asics',
  'essentials',
  'adidas',
  'travis-scott',
  'stussy',
];

/**
 * Zalando-style recommendation rails. "Viewed by others" and the sponsored
 * rail lean on Shopify's own best-selling ranking (a real popularity
 * signal — no fake tags needed) and are re-shuffled on every request so
 * the page feels alive.
 */
function buildRails(
  storefront: Route.LoaderArgs['context']['storefront'],
  product: {id: string; title: string; productType?: string | null},
) {
  const brand = brandTagSlug(product.title);
  const type = (product.productType ?? '').replace(/['"\\]/g, '');
  const sponsorBrand =
    SPONSOR_POOL.filter((slug) => slug !== brand)[
      Math.floor(
        Math.random() *
          (SPONSOR_POOL.length -
            (brand && SPONSOR_POOL.includes(brand) ? 1 : 0)),
      )
    ] ?? 'nike';

  const fetchRail = (query: string) =>
    storefront
      .query(RAIL_PRODUCTS_QUERY, {
        variables: {query, first: 24},
        // A few dozen distinct rails serve all 9,500 product pages — see
        // ~/lib/cache for why these in particular must stay warm.
        cache: railCache(storefront),
      })
      .then((result) =>
        shuffle(
          (result?.products?.nodes ?? []).filter(
            (node) => node.id !== product.id,
          ),
        ).slice(0, 10),
      )
      .catch((error: Error) => {
        console.error(error);
        return [];
      });

  return {
    viewedByOthers: fetchRail(type ? `product_type:'${type}'` : ''),
    sponsored: fetchRail(`tag:'brand:${sponsorBrand}'`),
    sponsorBrand,
    moreFromBrand: brand
      ? fetchRail(`tag:'brand:${brand}'`)
      : Promise.resolve([]),
    brandSlug: brand,
  };
}

/** Fisher–Yates; a fresh order on every request. */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Load data for rendering content below the fold. This data is deferred and will be
 * fetched after the initial page load. If it's unavailable, the page should still 200.
 * Make sure to not throw any errors here, as it will cause the page to 500.
 */
function loadDeferredData({context, params}: Route.LoaderArgs) {
  const recommended = params.handle
    ? context.storefront
        .query(RECOMMENDATIONS_QUERY, {
          variables: {handle: params.handle},
          cache: listingCache(context.storefront),
        })
        .catch((error: Error) => {
          console.error(error);
          return null;
        })
    : Promise.resolve(null);

  return {recommended};
}

function TruckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M2.5 6.5h11v10h-11zM13.5 10h4l3 3v3.5h-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle
        cx="7"
        cy="17.5"
        r="1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle
        cx="17"
        cy="17.5"
        r="1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function ReturnIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M8.5 5 5 8.5 8.5 12M5 8.5h9a5 5 0 0 1 0 10H7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M12 3.3 19 6v5.4c0 4.5-2.9 7.9-7 9.3-4.1-1.4-7-4.8-7-9.3V6l7-2.7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="m9 12 2.2 2.2L15.5 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Product() {
  const {
    product,
    recommended,
    viewedByOthers,
    sponsored,
    sponsorBrand,
    moreFromBrand,
    brandSlug,
    buyerCountry,
  } = useLoaderData<typeof loader>();
  const localize = useLocalizedHref();
  const t = useTranslate();

  // Optimistically selects a variant with given available variant information
  const selectedVariant = useOptimisticVariant(
    product.selectedOrFirstAvailableVariant,
    getAdjacentAndFirstAvailableVariants(product),
  );

  // Sets the search param to the selected variant without navigation
  // only when no search params are set in the url
  useSelectedOptionInUrlParam(selectedVariant.selectedOptions);

  // Get the product options array
  const productOptions = getProductOptions({
    ...product,
    selectedOrFirstAvailableVariant: selectedVariant,
  });

  const {title, descriptionHtml} = product;
  const collection = product.collections?.nodes?.[0];
  const brand = brandFromTitle(title);
  const location = useLocation();

  // If the shopper arrived from a listing, go back to that exact URL —
  // including its page, filters and sort — instead of the collection's
  // first page. Variant/size changes replace the history entry (wiping
  // router state), so hold on to the last referrer we saw.
  const cameFromRef = useRef<string | undefined>(undefined);
  const stateFrom = (location.state as {from?: string} | null)?.from;
  if (stateFrom) cameFromRef.current = stateFrom;
  const cameFrom = cameFromRef.current;
  const backTo =
    cameFrom ??
    (collection
      ? localize(`/collections/${collection.handle}`)
      : localize('/collections/all'));
  const backLabel =
    !cameFrom || (collection && cameFrom.includes(`/${collection.handle}`))
      ? (collection?.title ?? t('All products'))
      : t('Back');

  return (
    <>
      <div className="product-page page-container">
        <nav className="product-back" aria-label="Breadcrumb">
          <Link to={backTo}>
            <span aria-hidden="true">←</span> {backLabel}
          </Link>
        </nav>

        <div className="product">
          <div className="product-gallery-wrap">
            <ProductGallery
              images={product.images?.nodes ?? []}
              selectedVariantImage={selectedVariant?.image}
              title={title}
            />
          </div>
          <div className="product-main">
            {brand ? (
              brand.handle ? (
                <Link
                  className="product-brand-link"
                  prefetch="intent"
                  to={localize(`/collections/${brand.handle}`)}
                >
                  {brand.label}
                </Link>
              ) : (
                <span className="product-brand-link">{brand.label}</span>
              )
            ) : displayVendor(product.vendor) ? (
              <span className="product-brand-link">
                {displayVendor(product.vendor)}
              </span>
            ) : null}
            <ReviewBadge />
            <h1>{title}</h1>
            <div className="product-price-row">
              <ProductPrice
                price={selectedVariant?.price}
                compareAtPrice={selectedVariant?.compareAtPrice}
              />
            </div>
            <KlarnaLine
              price={selectedVariant?.price}
              buyerCountry={buyerCountry}
            />

            <ProductForm
              productOptions={productOptions}
              productTitle={product.title}
              selectedVariant={selectedVariant}
              favoriteSlot={
                <FavoriteButton productId={product.id} title={title} />
              }
            />

            {/* Directly under Add to cart: this answers "can I pay the way I
                want to" at the moment the shopper is deciding, rather than in
                the footer where they'd have to go looking. */}
            <div className="product-payments">
              <span className="product-payments-label">
                {t('Secure checkout')}
              </span>
              <PaymentIcons />
            </div>

            <TrustStories />

            <div className="product-note-strip">
              <ShieldCheckIcon />
              <span>
                {t('100% authentic — checked before it ships.')}
              </span>
            </div>

            <div className="product-accordions">
              {descriptionHtml ? (
                <details className="product-accordion">
                  <summary>{t('Description')}</summary>
                  <div
                    className="prose"
                    dangerouslySetInnerHTML={{__html: descriptionHtml}}
                  />
                </details>
              ) : null}
              <details className="product-accordion">
                <summary>{t('Product details')}</summary>
                <div className="prose">
                  {!descriptionHtml ? (
                    <p>
                      {product.title}{' '}
                      {displayVendor(product.vendor)
                        ? t('by {vendor}').replace(
                            '{vendor}',
                            displayVendor(product.vendor)!,
                          )
                        : ''}{' '}
                      {t(
                        '— a piece from the {name} collection, 100% authentic and checked before it ships.',
                      ).replace('{name}', SHOP.name)}
                    </p>
                  ) : null}
                  <dl className="product-specs">
                    {/* The PRODUCT's brand (Nike, Essentials…), never the
                      store: real third-party vendor first, else derived
                      from the title. */}
                    {(cardVendor(product.vendor) ??
                    brandFromTitle(product.title)?.label) ? (
                      <div className="product-spec">
                        <dt>{t('Brand')}</dt>
                        <dd>
                          {cardVendor(product.vendor) ??
                            brandFromTitle(product.title)?.label}
                        </dd>
                      </div>
                    ) : null}
                    {product.productType ? (
                      <div className="product-spec">
                        <dt>{t('Category')}</dt>
                        <dd>{displayTypeLabel(product.productType)}</dd>
                      </div>
                    ) : null}
                    <div className="product-spec">
                      <dt>{t('Authenticity')}</dt>
                      <dd>{t('100% authentic, checked before shipping')}</dd>
                    </div>
                    <div className="product-spec">
                      <dt>{t('Sizing')}</dt>
                      <dd>
                        {t('True to size —')}{' '}
                        <Link to={localize('/pages/size-guide')}>
                          {t('see the size guide')}
                        </Link>
                      </dd>
                    </div>
                  </dl>
                </div>
              </details>
              <details className="product-accordion">
                <summary>{t('Shipping & returns')}</summary>
                <div className="product-service-card">
                  <div className="product-service-row product-service-head">
                    {t('Sold & shipped by')} <strong>{SHOP.name}</strong>
                  </div>
                  <div className="product-service-row">
                    <TruckIcon />
                    <span>
                      {t('Standard delivery — {estimate}').replace(
                        '{estimate}',
                        t(SHOP.deliveryEstimate),
                      )}
                      <small>
                        {t('Ships within {x}').replace(
                          '{x}',
                          t(SHOP.shipsWithin),
                        )}
                      </small>
                    </span>
                    <em>{t('Free shipping')}</em>
                  </div>
                  <div className="product-service-row">
                    <ReturnIcon />
                    <span>
                      {t('{days}-day right of return').replace(
                        '{days}',
                        String(SHOP.returnDays),
                      )}
                    </span>
                  </div>
                  <div className="product-service-row">
                    <ShieldCheckIcon />
                    <span>{t('100% authentic, checked before shipping')}</span>
                  </div>
                </div>
                <div className="prose">
                  <p>
                    {t(
                      'Changed your mind? You have {days} days after delivery to request a return for unworn items with their original tags. See the',
                    ).replace('{days}', String(SHOP.returnDays))}{' '}
                    <Link to={localize('/policies/shipping-policy')}>
                      {t('shipping policy')}
                    </Link>{' '}
                    {t('and')}{' '}
                    <Link to={localize('/policies/refund-policy')}>
                      {t('refund policy')}
                    </Link>{' '}
                    {t('for details.')}
                  </p>
                </div>
              </details>
              <details className="product-accordion">
                <summary>{t('Sizing & fit')}</summary>
                <div className="prose">
                  <p>
                    {t(
                      'Apparel runs true to size with a relaxed streetwear cut — size down for a slimmer fit. Sneakers are listed in EU sizing; kids’ pairs are marked (GS), (PS) or (TD). Full measurements and conversion charts are in the',
                    )}{' '}
                    <Link to={localize('/pages/size-guide')}>
                      {t('size guide')}
                    </Link>
                    .
                  </p>
                </div>
              </details>
              <details className="product-accordion">
                <summary>{t('Authenticity')}</summary>
                <div className="prose">
                  <p>
                    {t(SHOP.disclaimer)} {t('See')}{' '}
                    <Link to={localize('/pages/authenticity')}>
                      {t('how we check every item')}
                    </Link>
                    . {t('If anything about your order isn’t right, we’ll sort it — read our')}{' '}
                    <Link to={localize('/pages/faq')}>{t('FAQ')}</Link>{' '}
                    {t('or')}{' '}
                    <Link to={localize('/pages/contact')}>
                      {t('contact the team')}
                    </Link>
                    .
                  </p>
                </div>
              </details>
            </div>
          </div>
        </div>

        <Analytics.ProductView
          data={{
            products: [
              {
                id: product.id,
                title: product.title,
                price: selectedVariant?.price.amount || '0',
                vendor: product.vendor,
                productType: product.productType,
                variantId: selectedVariant?.id || '',
                variantTitle: selectedVariant?.title || '',
                quantity: 1,
              },
            ],
          }}
        />
      </div>

      {/* Everything below the buy box sits outside .page-container on
          purpose. The container caps at --maxw and adds gutters; these bands
          and rails are meant to run to the screen edge, which is also why a
          rail's last card is cut off by the viewport rather than by a centred
          column — that cut is what tells you the row scrolls. Breaking out
          with 100vw instead would overhang by the scrollbar's width and add a
          horizontal scroll to the page. */}

      {/* Vertical clips from our socials, each linking to its collection —
          first thing under the buy box, just above "Often seen with". */}
      <ShopVideos />

      {/* Zalando-style recommendation rails, freshly shuffled per visit */}
      <ProductRail
        title={t('Often seen with')}
        subtitle={t('Items viewed by others')}
        products={viewedByOthers}
        moreTo="/collections/all?sort_by=best-selling"
      />
      <ProductRail
        title={t('More from top brands')}
        subtitle={t('Recommended')}
        products={sponsored}
        moreTo={`/collections/${sponsorBrand}`}
      />
      <RelatedProducts recommended={recommended} />
      {brandSlug ? (
        <ProductRail
          title={t('More from {brand}').replace(
            '{brand}',
            brandLabel(brandSlug),
          )}
          products={moreFromBrand}
          moreTo={`/collections/${brandSlug}`}
        />
      ) : null}

      <CustomerLove />
      <InstaStrip />
    </>
  );
}

/**
 * One Zalando-style rail: stacked bold heading, a "Discover more →" link
 * and a swipeable row of cards. Renders nothing while empty.
 */
function ProductRail({
  title,
  subtitle,
  products,
  moreTo,
}: {
  title: string;
  subtitle?: string;
  products: Promise<ProductCardFragment[]>;
  moreTo?: string;
}) {
  const localize = useLocalizedHref();
  const t = useTranslate();
  return (
    <Suspense fallback={null}>
      <Await resolve={products} errorElement={<></>}>
        {(items) => {
          if (!items || items.length === 0) return null;
          return (
            <section className="pdp-rail" aria-label={title}>
              <div className="pdp-rail-head">
                <div>
                  <h2>{title}</h2>
                  {subtitle ? <p>{subtitle}</p> : null}
                </div>
                {moreTo ? (
                  <Link className="pdp-rail-more" to={localize(moreTo)}>
                    {t('Discover more →')}
                  </Link>
                ) : null}
              </div>
              <ProductsRail>
                {items.map((item) => (
                  <div className="products-carousel-item" key={item.id}>
                    <ProductItem product={item} />
                  </div>
                ))}
              </ProductsRail>
            </section>
          );
        }}
      </Await>
    </Suspense>
  );
}

function RelatedProducts({
  recommended,
}: {
  recommended: Promise<ProductRecommendationsQuery | null>;
}) {
  return (
    <Suspense fallback={null}>
      <Await resolve={recommended} errorElement={<></>}>
        {(result) => {
          const products = result?.productRecommendations?.slice(0, 8) ?? [];
          if (products.length === 0) return null;
          return <RelatedCarousel products={products} />;
        }}
      </Await>
    </Suspense>
  );
}

/**
 * "You may also like" as a swipeable carousel: 8 recommendations, 4 per
 * view on desktop (arrows page through), swipe on mobile. Scroll-snap
 * keeps cards aligned; quick add works on every card.
 */
function RelatedCarousel({
  products,
}: {
  products: NonNullable<
    NonNullable<ProductRecommendationsQuery['productRecommendations']>
  >;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const t = useTranslate();

  const page = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({left: direction * track.clientWidth, behavior: 'smooth'});
  };

  return (
    <section className="related-products" aria-label="Related products">
      <div className="section-head-split">
        <div>
          <span className="eyebrow">{t('What do you think?')}</span>
          <h2>{t('Variants of this look')}</h2>
        </div>
        <div className="carousel-nav" aria-hidden={products.length <= 4}>
          <button
            type="button"
            className="carousel-arrow reset"
            aria-label={t('Previous products')}
            onClick={() => page(-1)}
          >
            ←
          </button>
          <button
            type="button"
            className="carousel-arrow reset"
            aria-label={t('Next products')}
            onClick={() => page(1)}
          >
            →
          </button>
        </div>
      </div>
      {/* A focusable scroll container is the accessible pattern here —
          keyboard users need to focus the rail to scroll it with the arrow
          keys. The lint rule is stricter than WCAG on this one. */}
      <div
        className="products-carousel"
        ref={trackRef}
        role="group"
        aria-label="Related products"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
      >
        {products.map((related) => (
          <div className="products-carousel-item" key={related.id}>
            <ProductItem product={related} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const localize = useLocalizedHref();
  const t = useTranslate();
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  if (!notFound) {
    console.error(error);
  }

  return (
    <div className="route-error">
      <span className="route-error-status">{notFound ? '404' : 'Error'}</span>
      <h1>{notFound ? t('Product unavailable') : t('Something went wrong')}</h1>
      <p>
        {notFound
          ? t('This product doesn’t exist or is no longer available.')
          : t('We couldn’t load this product. Please try again in a moment.')}
      </p>
      <div className="route-error-actions">
        <Link className="btn btn-primary" to={localize('/collections/all')}>
          {t('Shop all products')}
        </Link>
        <Link className="btn btn-ghost" to={localize('/')}>
          {t('Back to homepage')}
        </Link>
      </div>
    </div>
  );
}

const PRODUCT_VARIANT_FRAGMENT = `#graphql
  fragment ProductVariant on ProductVariant {
    availableForSale
    compareAtPrice {
      amount
      currencyCode
    }
    id
    image {
      __typename
      id
      url
      altText
      width
      height
    }
    price {
      amount
      currencyCode
    }
    product {
      title
      handle
    }
    selectedOptions {
      name
      value
    }
    sku
    title
    unitPrice {
      amount
      currencyCode
    }
  }
` as const;

const PRODUCT_FRAGMENT = `#graphql
  fragment Product on Product {
    id
    title
    vendor
    productType
    handle
    descriptionHtml
    description
    encodedVariantExistence
    encodedVariantAvailability
    featuredImage {
      id
      url
      altText
      width
      height
    }
    images(first: 10) {
      nodes {
        id
        url
        altText
        width
        height
      }
    }
    collections(first: 1) {
      nodes {
        handle
        title
      }
    }
    options {
      name
      optionValues {
        name
        firstSelectableVariant {
          ...ProductVariant
        }
        swatch {
          color
          image {
            previewImage {
              url
            }
          }
        }
      }
    }
    selectedOrFirstAvailableVariant(selectedOptions: $selectedOptions, ignoreUnknownOptions: true, caseInsensitiveMatch: true) {
      ...ProductVariant
    }
    adjacentVariants (selectedOptions: $selectedOptions) {
      ...ProductVariant
    }
    seo {
      description
      title
    }
  }
  ${PRODUCT_VARIANT_FRAGMENT}
` as const;

const PRODUCT_QUERY = `#graphql
  query Product(
    $country: CountryCode
    $handle: String!
    $language: LanguageCode
    $selectedOptions: [SelectedOptionInput!]!
  ) @inContext(country: $country, language: $language) {
    product(handle: $handle) {
      ...Product
    }
  }
  ${PRODUCT_FRAGMENT}
` as const;

/** Generic "products matching a query, most popular first" for the rails. */
const RAIL_PRODUCTS_QUERY = `#graphql
  ${PRODUCT_CARD_FRAGMENT}
  query RailProducts(
    $query: String!
    $first: Int!
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    products(first: $first, query: $query, sortKey: BEST_SELLING) {
      nodes {
        ...ProductCard
      }
    }
  }
` as const;

const RECOMMENDATIONS_QUERY = `#graphql
  query ProductRecommendations(
    $handle: String!
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    productRecommendations(productHandle: $handle, intent: RELATED) {
      ...ProductCard
    }
  }
  ${PRODUCT_CARD_FRAGMENT}
` as const;
