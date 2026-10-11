import type {Route} from './+types/($locale).cart-recommendations';

/**
 * Products to suggest beside the cart — a resource route with no UI.
 *
 * The cart drawer opens on every page, so its suggestions cannot come from a
 * page loader; the rail fetches this instead, once, when the drawer first
 * opens.
 *
 * Deliberately NOT the shared ProductCard fragment. That one carries 24
 * variants per product for quick-add, which is the right trade for a grid and
 * the wrong one here: this rail only ever adds the first available variant,
 * so it asks for the handful of fields it draws and nothing else.
 */
const CART_RECOMMENDATIONS_QUERY = `#graphql
  query CartRecommendations(
    $handle: String!
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    productRecommendations(productHandle: $handle, intent: COMPLEMENTARY) {
      id
      handle
      title
      featuredImage {
        altText
        url
        width
        height
      }
      firstVariant: selectedOrFirstAvailableVariant(
        selectedOptions: []
        ignoreUnknownOptions: true
        caseInsensitiveMatch: true
      ) {
        id
        availableForSale
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
  }
` as const;

/**
 * Hand-written because codegen only types the queries it can see at build
 * time, and this one is fetched at runtime by the cart rail.
 */
export type CartRecProduct = {
  id: string;
  handle: string;
  title: string;
  featuredImage?: {
    altText?: string | null;
    url: string;
    width?: number | null;
    height?: number | null;
  } | null;
  firstVariant?: {
    id: string;
    availableForSale: boolean;
    price: {amount: string; currencyCode: string};
    compareAtPrice?: {amount: string; currencyCode: string} | null;
  } | null;
};

export async function loader({request, context}: Route.LoaderArgs) {
  const url = new URL(request.url);
  const handle = url.searchParams.get('handle');
  // Handles of what is already in the basket — suggesting those back is the
  // fastest way to make a recommendation rail look broken.
  const exclude = new Set(
    (url.searchParams.get('exclude') ?? '').split(',').filter(Boolean),
  );

  if (!handle) return {products: []};

  try {
    const result = (await context.storefront.query(
      CART_RECOMMENDATIONS_QUERY,
      {variables: {handle}},
    )) as {productRecommendations?: CartRecProduct[] | null};
    const products = (result?.productRecommendations ?? [])
      .filter((product) => !exclude.has(product.handle))
      .filter((product) => product.firstVariant?.availableForSale)
      .slice(0, 12);
    return {products};
  } catch {
    // A dead rail is better than a dead cart: the drawer must still work.
    return {products: []};
  }
}
