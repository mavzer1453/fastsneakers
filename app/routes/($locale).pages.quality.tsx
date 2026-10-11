import {redirect} from 'react-router';
import type {Route} from './+types/($locale).pages.quality';
import {localizePath} from '~/lib/i18n';

/**
 * The page moved to /pages/authenticity. Keep the old address working with a
 * permanent redirect so existing links and anything already crawled don't
 * land on a 404.
 */
export async function loader({context}: Route.LoaderArgs) {
  return redirect(
    localizePath('/pages/authenticity', context.storefront.i18n),
    301,
  );
}
