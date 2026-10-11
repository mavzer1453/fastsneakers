import type {Route} from './+types/($locale).account_.register';

// With Shopify's new customer accounts, creating an account and signing in use
// the same hosted (brandable) flow, so we hand off directly to it here.
export async function loader({context}: Route.LoaderArgs) {
  return context.customerAccount.login({
    countryCode: context.storefront.i18n.country,
  });
}
