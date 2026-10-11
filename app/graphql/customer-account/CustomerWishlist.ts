// NOTE: Customer Account API operations for the shopper's wishlist / favorites.
// These must live under app/graphql/customer-account/ so codegen validates them
// against the Customer Account schema (see .graphqlrc.ts).

export const CUSTOMER_WISHLIST_QUERY = `#graphql
  query CustomerWishlist {
    customer {
      id
      wishlist: metafield(namespace: "custom", key: "wishlist") {
        value
      }
    }
  }
` as const;

export const SET_CUSTOMER_WISHLIST_MUTATION = `#graphql
  mutation SetCustomerWishlist($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        key
        value
      }
      userErrors {
        field
        message
        code
      }
    }
  }
` as const;
