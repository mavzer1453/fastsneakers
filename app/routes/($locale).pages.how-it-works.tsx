import {redirect} from 'react-router';
import type {Route} from './+types/($locale).pages.how-it-works';
import {localizePath} from '~/lib/i18n';

/**
 * Legacy route from the previous store concept. The content now lives at
 * /pages/size-guide — permanent redirect so old links and search results
 * keep working.
 */
export async function loader({context}: Route.LoaderArgs) {
  throw redirect(localizePath('/pages/size-guide', context.storefront.i18n), {
    status: 301,
  });
}

export default function HowItWorksRedirect() {
  return null;
}
