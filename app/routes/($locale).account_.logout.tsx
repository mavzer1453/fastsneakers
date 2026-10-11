import {redirect} from 'react-router';
import type {Route} from './+types/($locale).account_.logout';
import {localizePath} from '~/lib/i18n';
import {clearIdentityCookies} from '~/lib/meta-cookies.server';

// Signing out is a POST — see the action below. A bare GET only lands here
// by accident, so it redirects home rather than ending a session on a
// prefetch or a cross-site <img>. (Without this loader, /account/logout
// would be caught by account.$.tsx and bounce the visitor into login.)
export async function loader({context}: Route.LoaderArgs) {
  return redirect(localizePath('/', context.storefront.i18n));
}

export async function action({context, request}: Route.ActionArgs) {
  const response = await context.customerAccount.logout();
  // Drop the advertising identity hashes along with the session — see
  // `clearIdentityCookies`. Appended, never `set`, so the logout redirect's
  // own session cookies survive.
  for (const cookie of clearIdentityCookies(request)) {
    response.headers.append('Set-Cookie', cookie);
  }
  return response;
}
