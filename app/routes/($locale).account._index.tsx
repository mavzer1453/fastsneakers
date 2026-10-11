import {redirect} from 'react-router';
import type {Route} from './+types/($locale).account._index';
import {localizePath} from '~/lib/i18n';

export async function loader({context}: Route.LoaderArgs) {
  return redirect(localizePath('/account/orders', context.storefront.i18n));
}
