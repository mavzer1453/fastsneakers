import {data as remixData} from 'react-router';
import type {Route} from './+types/($locale).newsletter';

/**
 * Footer newsletter signup — a resource route with no UI of its own.
 *
 * Uses the Storefront API directly (not the new Customer Accounts flow) so
 * shoppers can opt in to marketing emails without creating a login. Legacy
 * `customerCreate` still requires a password, so we generate a random one
 * the shopper never sees or needs.
 */
export async function action({request, context}: Route.ActionArgs) {
  const form = await request.formData();
  const email = String(form.get('email') || '').trim();

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!validEmail) {
    return remixData(
      {ok: false as const, error: 'Enter a valid email address.'},
      {status: 400},
    );
  }

  try {
    const {customerCreate} = await context.storefront.mutate(
      NEWSLETTER_SIGNUP_MUTATION,
      {
        variables: {
          input: {
            email,
            password: crypto.randomUUID(),
            acceptsMarketing: true,
          },
        },
      },
    );

    const errors = customerCreate?.customerUserErrors ?? [];
    // A "TAKEN" error just means this email already has an account — treat
    // that as a successful opt-in rather than surfacing a scary error.
    const fatalErrors = errors.filter((error) => error.code !== 'TAKEN');

    if (fatalErrors.length > 0) {
      return remixData(
        {ok: false as const, error: fatalErrors[0].message},
        {status: 400},
      );
    }

    return remixData({ok: true as const});
  } catch (error) {
    console.error('Newsletter signup failed:', error);
    return remixData(
      {ok: false as const, error: 'Something went wrong. Please try again.'},
      {status: 500},
    );
  }
}

const NEWSLETTER_SIGNUP_MUTATION = `#graphql
  mutation newsletterSignup($input: CustomerCreateInput!) {
    customerCreate(input: $input) {
      customer {
        id
      }
      customerUserErrors {
        code
        field
        message
      }
    }
  }
` as const;
