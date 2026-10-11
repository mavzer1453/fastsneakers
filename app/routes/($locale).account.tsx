import {
  data as remixData,
  Form,
  Link,
  NavLink,
  Outlet,
  useLoaderData,
} from 'react-router';
import type {Route} from './+types/($locale).account';
import {CUSTOMER_DETAILS_QUERY} from '~/graphql/customer-account/CustomerDetailsQuery';
import {useLocalizedHref} from '~/lib/localizedLink';
import {useTranslate} from '~/lib/useTranslate';

export function shouldRevalidate() {
  return true;
}

export async function loader({context}: Route.LoaderArgs) {
  const {customerAccount} = context;
  const {data, errors} = await customerAccount.query(CUSTOMER_DETAILS_QUERY, {
    variables: {
      language: customerAccount.i18n.language,
    },
  });

  if (errors?.length || !data?.customer) {
    // Rendered by this route's ErrorBoundary — usually an expired session.
    throw new Response('We could not load your account.', {status: 401});
  }

  return remixData(
    {customer: data.customer},
    {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    },
  );
}

export default function AccountLayout() {
  const {customer} = useLoaderData<typeof loader>();
  const t = useTranslate();

  const heading = customer
    ? customer.firstName
      ? t('Welcome back, {name}').replace('{name}', customer.firstName)
      : t('Welcome to your account')
    : t('Account');

  return (
    <div className="account page-container">
      {/* Sign out sits with the greeting, not in the tab row below it — it
          is an action, not a section of the account, and mixing the two put
          a destructive button one tap away from "Addresses". */}
      <div className="account-header">
        <div className="account-header-text">
          <span className="eyebrow">{t('Your account')}</span>
          <h1>{heading}</h1>
          <p>{t('Manage your orders, saved addresses and personal details.')}</p>
        </div>
        <Logout />
      </div>
      <AccountNav />
      <div className="account-content">
        <Outlet context={{customer}} />
      </div>
    </div>
  );
}

const ACCOUNT_TABS = [
  {to: '/account/orders', label: 'Orders'},
  {to: '/account/profile', label: 'Profile'},
  {to: '/account/addresses', label: 'Addresses'},
  {to: '/favorites', label: 'Favorites'},
];

/**
 * One scrollable row of tabs, matching the category strip in the header.
 * Wrapping made the row two ragged lines on a phone; scrolling keeps it a
 * single line at any width.
 */
function AccountNav() {
  const localize = useLocalizedHref();
  const t = useTranslate();
  return (
    <nav className="account-nav" aria-label="Account sections">
      {ACCOUNT_TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={localize(tab.to)}
          className="account-nav-link"
          prefetch="intent"
        >
          {t(tab.label)}
        </NavLink>
      ))}
    </nav>
  );
}

function Logout() {
  const localize = useLocalizedHref();
  const t = useTranslate();
  return (
    <Form method="POST" action={localize('/account/logout')}>
      <button type="submit" className="account-signout">
        {t('Sign out')}
      </button>
    </Form>
  );
}

export function ErrorBoundary() {
  const localize = useLocalizedHref();
  const t = useTranslate();
  return (
    <div className="route-error">
      <span className="route-error-status">{t('Account')}</span>
      <h1>{t('We couldn’t load your account')}</h1>
      <p>{t('Your session may have expired — please sign in again.')}</p>
      <div className="route-error-actions">
        <Link className="btn btn-primary" to={localize('/account/login')}>
          {t('Sign in')}
        </Link>
        <Link className="btn btn-ghost" to={localize('/')}>
          {t('Back to homepage')}
        </Link>
      </div>
    </div>
  );
}
