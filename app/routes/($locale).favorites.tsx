import {useEffect} from 'react';
import {
  data as remixData,
  Link,
  useFetcher,
  useLoaderData,
} from 'react-router';
import type {Route} from './+types/($locale).favorites';
import {ProductItem} from '~/components/ProductItem';
import {
  getWishlistIds,
  mergeWishlistProducts,
  toggleWishlistProduct,
  useGuestWishlist,
} from '~/lib/wishlist';
import {useLocalizedHref} from '~/lib/localizedLink';
import {buildMeta} from '~/lib/seo';
import {PRODUCT_CARD_FRAGMENT} from '~/lib/productCardFragment';
import {useTranslate} from '~/lib/useTranslate';

export const meta: Route.MetaFunction = ({matches, location}) => {
  return buildMeta(
    {matches, pathname: location.pathname},
    {title: 'Favorites', noindex: true},
  );
};

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-cache, no-store, must-revalidate',
};

export async function loader({request, context}: Route.LoaderArgs) {
  const {customerAccount, storefront} = context;

  // `?ids=` lookup mode: the client resolves on-device favorites into
  // products through this same route (works for guests AND signed-in
  // shoppers whose account sync isn't configured yet).
  const idsParam = new URL(request.url).searchParams.get('ids');
  if (idsParam != null) {
    const lookupIds = idsParam
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.startsWith('gid://shopify/Product/'))
      .slice(0, 60);

    if (lookupIds.length === 0) {
      return remixData(
        {loggedIn: false, products: []},
        {headers: NO_STORE_HEADERS},
      );
    }

    const {nodes} = await storefront.query(FAVORITE_PRODUCTS_QUERY, {
      variables: {ids: lookupIds},
    });
    const products = (nodes ?? []).flatMap((node) =>
      node && 'handle' in node ? [node] : [],
    );

    return remixData({loggedIn: false, products}, {headers: NO_STORE_HEADERS});
  }

  const loggedIn = await customerAccount.isLoggedIn();
  if (!loggedIn) {
    return remixData(
      {loggedIn: false, products: []},
      {headers: NO_STORE_HEADERS},
    );
  }

  const ids = await getWishlistIds(customerAccount);
  if (ids.length === 0) {
    return remixData(
      {loggedIn: true, products: []},
      {headers: NO_STORE_HEADERS},
    );
  }

  const {nodes} = await storefront.query(FAVORITE_PRODUCTS_QUERY, {
    variables: {ids},
  });

  // Keep the order the shopper favorited them and drop any unavailable ones
  // (non-Product nodes resolve to an empty object).
  const products = (nodes ?? []).flatMap((node) =>
    node && 'handle' in node ? [node] : [],
  );

  return remixData({loggedIn: true, products}, {headers: NO_STORE_HEADERS});
}

export async function action({request, context}: Route.ActionArgs) {
  const {customerAccount} = context;

  const loggedIn = await customerAccount.isLoggedIn();
  if (!loggedIn) {
    return customerAccount.login();
  }

  const form = await request.formData();

  // Silent background sync: merge on-device favorites into the account
  // wishlist after sign-in. Fails quietly if the metafield isn't set up.
  if (String(form.get('intent') || '') === 'sync') {
    const syncIds = String(form.get('ids') || '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.startsWith('gid://shopify/Product/'))
      .slice(0, 60);
    if (syncIds.length === 0) {
      return remixData({ok: true as const, synced: [] as string[]});
    }
    try {
      await mergeWishlistProducts(customerAccount, syncIds);
      return remixData({ok: true as const, synced: syncIds});
    } catch (error) {
      console.error('Wishlist sync failed:', error);
      return remixData({
        ok: false as const,
        error: error instanceof Error ? error.message : 'Could not sync.',
      });
    }
  }

  const productId = String(form.get('productId') || '');
  const currentlyFavorite = String(form.get('favorited')) === 'true';

  if (!productId) {
    return remixData({ok: false as const, error: 'Missing product.'});
  }

  try {
    const favorites = await toggleWishlistProduct(
      customerAccount,
      productId,
      currentlyFavorite,
    );
    return remixData({ok: true as const, favorites});
  } catch (error) {
    // Surfaces metafieldsSet userErrors (e.g. the `custom.wishlist`
    // definition is missing in Shopify admin) instead of failing silently.
    console.error('Wishlist update failed:', error);
    return remixData({
      ok: false as const,
      error: error instanceof Error ? error.message : 'Could not save.',
    });
  }
}

export default function Favorites() {
  const {loggedIn, products} = useLoaderData<typeof loader>();
  const localize = useLocalizedHref();
  const t = useTranslate();
  const guestIds = useGuestWishlist();
  const guestFetcher = useFetcher<typeof loader>();

  // Resolve on-device favorites that the account list doesn't cover — for
  // guests that's everything; for signed-in shoppers it covers favorites
  // that only saved locally (e.g. account sync not configured yet).
  const serverIdSet = new Set(products.map((product) => product.id));
  const missingIds = guestIds.filter((id) => !serverIdSet.has(id));
  const missingKey = missingIds.join(',');
  const favoritesHref = localize('/favorites');

  useEffect(() => {
    if (!missingKey) return;
    void guestFetcher.load(
      `${favoritesHref}?ids=${encodeURIComponent(missingKey)}`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey, favoritesHref]);

  // Drop anything un-hearted since the fetch, then merge with account items.
  const guestSet = new Set(guestIds);
  const deviceProducts = (guestFetcher.data?.products ?? []).filter(
    (product) => guestSet.has(product.id) && !serverIdSet.has(product.id),
  );
  const allProducts = [...products, ...deviceProducts];
  const stillLoading =
    missingIds.length > 0 && allProducts.length === 0 && !guestFetcher.data;

  let content: React.ReactNode;
  if (allProducts.length > 0 || stillLoading) {
    content = (
      <>
        {!loggedIn && (
          <div className="favorites-guest-note">
            <p>
              {t(
                'These favorites are saved on this device. Sign in to keep them across all your devices.',
              )}
            </p>
            <Link className="btn btn-ghost" to={localize('/account/login')}>
              {t('Sign in')}
            </Link>
          </div>
        )}
        {stillLoading ? (
          <div className="favorites-empty">
            <p>{t('Loading your favorites…')}</p>
          </div>
        ) : (
          <div className="products-grid">
            {allProducts.map((product, index) => (
              <ProductItem
                key={product.id}
                product={product}
                loading={index < 8 ? 'eager' : undefined}
              />
            ))}
          </div>
        )}
      </>
    );
  } else {
    content = (
      <div className="favorites-empty">
        <p>
          {loggedIn
            ? t('Tap the heart on any product to save it here.')
            : t(
                'Tap the heart on any product to save it here — no account needed.',
              )}
        </p>
        <Link className="btn btn-primary" to={localize('/collections/all')}>
          {t('Browse products')}
        </Link>
      </div>
    );
  }

  return (
    <div className="favorites-page section">
      <div className="favorites-header">
        <span className="eyebrow">{t('Your list')}</span>
        <h1>{t('Favorites')}</h1>
        <p>{t('Products you’ve saved to come back to later.')}</p>
      </div>
      {content}
    </div>
  );
}

const FAVORITE_PRODUCTS_QUERY = `#graphql
  ${PRODUCT_CARD_FRAGMENT}
  query FavoriteProducts(
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
