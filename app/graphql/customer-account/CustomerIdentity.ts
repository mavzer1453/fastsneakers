// NOTE: Customer Account API operations for the hashed Meta identity.
// These must live under app/graphql/customer-account/ so codegen validates them
// against the Customer Account schema (see .graphqlrc.ts).
//
// `emailAddress` and `phoneNumber` are wrapper objects on this schema and do
// not exist at all on the Storefront one, so a copy of this query kept
// anywhere else in app/ fails `npm run build` at the codegen step.

export const CUSTOMER_IDENTITY_QUERY = `#graphql
  query CustomerIdentity {
    customer {
      firstName
      lastName
      emailAddress {
        emailAddress
      }
      phoneNumber {
        phoneNumber
      }
    }
  }
` as const;
