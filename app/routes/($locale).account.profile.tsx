import type {CustomerFragment} from 'customer-accountapi.generated';
import type {CustomerUpdateInput} from '@shopify/hydrogen/customer-account-api-types';
import {CUSTOMER_UPDATE_MUTATION} from '~/graphql/customer-account/CustomerUpdateMutation';
import {
  data,
  Form,
  Link,
  useActionData,
  useNavigation,
  useOutletContext,
} from 'react-router';
import type {Route} from './+types/($locale).account.profile';
import {useLocalizedHref} from '~/lib/localizedLink';
import {useTranslate} from '~/lib/useTranslate';

export type ActionResponse = {
  error: string | null;
  customer: CustomerFragment | null;
};

export const meta: Route.MetaFunction = () => {
  return [{title: 'Profile'}];
};

export async function loader({context}: Route.LoaderArgs) {
  await context.customerAccount.handleAuthStatus();

  return {};
}

export async function action({request, context}: Route.ActionArgs) {
  const {customerAccount} = context;

  if (request.method !== 'PUT') {
    return data({error: 'Method not allowed'}, {status: 405});
  }

  const form = await request.formData();

  try {
    const customer: CustomerUpdateInput = {};
    const validInputKeys = ['firstName', 'lastName'] as const;
    for (const [key, value] of form.entries()) {
      if (!validInputKeys.includes(key as any)) {
        continue;
      }
      if (typeof value === 'string' && value.length) {
        customer[key as (typeof validInputKeys)[number]] = value;
      }
    }

    // update customer and possibly password
    const {data, errors} = await customerAccount.mutate(
      CUSTOMER_UPDATE_MUTATION,
      {
        variables: {
          customer,
          language: customerAccount.i18n.language,
        },
      },
    );

    if (errors?.length) {
      throw new Error(errors[0].message);
    }

    if (!data?.customerUpdate?.customer) {
      throw new Error('Customer profile update failed.');
    }

    return {
      error: null,
      customer: data?.customerUpdate?.customer,
    };
  } catch (error: any) {
    return data(
      {error: error.message, customer: null},
      {
        status: 400,
      },
    );
  }
}

export default function AccountProfile() {
  const account = useOutletContext<{customer: CustomerFragment}>();
  const {state} = useNavigation();
  const action = useActionData<ActionResponse>();
  const localize = useLocalizedHref();
  const t = useTranslate();
  const customer = action?.customer ?? account?.customer;
  const addresses = customer?.addresses?.nodes ?? [];
  const defaultAddressId = customer?.defaultAddress?.id;

  return (
    <div className="account-profile">
      <section className="account-panel">
        <div className="account-panel-head">
          <div>
            <h2>{t('My profile')}</h2>
            <p className="account-panel-sub">
              {t('Update your personal information.')}
            </p>
          </div>
        </div>
        <Form method="PUT" className="account-form">
          <div className="account-form-row">
            <div className="account-field">
              <label htmlFor="firstName">{t('First name')}</label>
              <input
                id="firstName"
                name="firstName"
                type="text"
                autoComplete="given-name"
                placeholder={t('First name')}
                aria-label={t('First name')}
                defaultValue={customer.firstName ?? ''}
                minLength={2}
              />
            </div>
            <div className="account-field">
              <label htmlFor="lastName">{t('Last name')}</label>
              <input
                id="lastName"
                name="lastName"
                type="text"
                autoComplete="family-name"
                placeholder={t('Last name')}
                aria-label={t('Last name')}
                defaultValue={customer.lastName ?? ''}
                minLength={2}
              />
            </div>
          </div>
          {action?.error ? (
            <p className="account-error">{action.error}</p>
          ) : null}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={state !== 'idle'}
          >
            {state !== 'idle' ? t('Updating…') : t('Save changes')}
          </button>
        </Form>
      </section>

      <section className="account-panel">
        <div className="account-panel-head">
          <div>
            <h2>{t('Addresses')}</h2>
            <p className="account-panel-sub">
              {t('Your saved shipping addresses and region.')}
            </p>
          </div>
          <Link to={localize('/account/addresses')} className="btn btn-ghost">
            {t('Manage addresses')}
          </Link>
        </div>

        {addresses.length ? (
          <div className="address-grid">
            {addresses.map((address) => {
              // Formatted lines are a fixed, display-only list — nothing
              // reorders, inserts or removes one between renders — and two
              // lines of the same address can read alike, so position is the
              // only key that is guaranteed unique. Pairing it up here keeps
              // the index out of the `key` prop itself.
              const lines = (address.formatted ?? []).map((line, index) => ({
                id: `${address.id}-${index}`,
                line,
              }));
              return (
                <article key={address.id} className="address-card">
                  {address.id === defaultAddressId && (
                    <span className="address-default-badge">
                      {t('Default')}
                    </span>
                  )}
                  <address className="address-lines">
                    {lines.map(({id, line}) => (
                      <span key={id}>{line}</span>
                    ))}
                  </address>
                  {address.phoneNumber && (
                    <p className="address-phone">{address.phoneNumber}</p>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="orders-empty">
            <div className="orders-empty-icon" aria-hidden="true">
              📍
            </div>
            <h3>{t('No addresses saved')}</h3>
            <p>
              {t('Add a shipping address so checkout is faster next time.')}
            </p>
            <Link
              to={localize('/account/addresses')}
              className="btn btn-primary"
            >
              {t('Add an address')}
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
