import {Link, useLoaderData} from 'react-router';
import type {Route} from './+types/($locale).policies.$handle';
import {type Shop} from '@shopify/hydrogen/storefront-api-types';
import {getLocalizedPolicy} from '~/data/policies';
import {useLocalizedHref} from '~/lib/localizedLink';
import {buildMeta} from '~/lib/seo';
import {useTranslate} from '~/lib/useTranslate';

type SelectedPolicies = keyof Pick<
  Shop,
  'privacyPolicy' | 'shippingPolicy' | 'termsOfService' | 'refundPolicy'
>;

export const meta: Route.MetaFunction = ({data, matches, location}) => {
  return buildMeta(
    {matches, pathname: location.pathname},
    {title: data?.title ?? 'Policy'},
  );
};

/** Policies that exist in Shopify admin (Settings → Policies) and are
 * exposed by the Storefront API. Shopify admin is the SINGLE SOURCE OF TRUTH
 * for these: Google Merchant Center reads the same text through the Shopify
 * channel, so the storefront must never show a different version. */
const SHOPIFY_POLICIES: Record<string, SelectedPolicies> = {
  'privacy-policy': 'privacyPolicy',
  'refund-policy': 'refundPolicy',
  'shipping-policy': 'shippingPolicy',
  'terms-of-service': 'termsOfService',
};

/**
 * The admin policy bodies were pasted from the old storefront, so they carry
 * its wrapper markup (`<main><div class="policy-page section"><article>`),
 * a numbered heading that repeats the page title ("4. Refund policy") and
 * links to the checkout sub-domain. Strip / rewrite those so the page renders
 * cleanly inside our own layout and every link stays on the main domain.
 */
function cleanPolicyBody(html: string): string {
  return html
    .replace(/<\/?main[^>]*>/gi, '')
    .replace(/<div class="policy-page section">/gi, '')
    .replace(/<article class="policy-content">/gi, '')
    .replace(/<\/article>\s*<\/div>/gi, '')
    .replace(/<meta[^>]*>/gi, '')
    .replace(/^\s*<hr\s*\/?>/i, '')
    .replace(/^\s*<h2[^>]*>\s*\d+\.\s[^<]*<\/h2>/i, '')
    .replace(
      /https?:\/\/checkout\.fastsneaker\.com\/pages\/data-sharing-opt-out/gi,
      '/pages/data-sharing-opt-out',
    )
    .replace(/https?:\/\/checkout\.fastsneaker\.com/gi, '')
    .trim();
}

export async function loader({params, context}: Route.LoaderArgs) {
  if (!params.handle) {
    throw new Response('No handle was passed in', {status: 404});
  }

  const language = context.storefront.i18n?.language ?? 'EN';
  const policyName = SHOPIFY_POLICIES[params.handle];

  // 1. Shopify admin policy — what Merchant Center sees.
  if (policyName) {
    try {
      const data = await context.storefront.query(POLICY_CONTENT_QUERY, {
        variables: {
          privacyPolicy: false,
          shippingPolicy: false,
          termsOfService: false,
          refundPolicy: false,
          [policyName]: true,
          language: context.storefront.i18n?.language,
        },
      });
      const policy = data.shop?.[policyName];
      if (policy?.body) {
        return {
          handle: params.handle,
          title: policy.title,
          updated: null as string | null,
          body: cleanPolicyBody(policy.body),
        };
      }
    } catch (error) {
      console.error(`[policies] Shopify ${policyName} failed`, error);
    }
    // Never fall back to the old local copy for these four: it is out of date
    // (e.g. an old return fee) and would contradict what Merchant Center
    // reads. A short 503 is safer than showing a different policy.
    throw new Response('Policy temporarily unavailable', {
      status: 503,
      headers: {'Retry-After': '60'},
    });
  }

  // 2. First-party pages with no Storefront API equivalent (contact
  //    information, legal notice) — and a last-resort fallback if Shopify
  //    is unreachable.
  const local = getLocalizedPolicy(params.handle, language);
  if (local) {
    return {
      handle: params.handle,
      title: local.title,
      updated: local.updated as string | null,
      body: local.body,
    };
  }

  throw new Response('Could not find the policy', {status: 404});
}

export default function Policy() {
  const {title, updated, body} = useLoaderData<typeof loader>();
  const localize = useLocalizedHref();
  const t = useTranslate();

  return (
    <div className="policy-page section">
      <div className="policy-page-header">
        <span className="eyebrow">{t('Legal')}</span>
        <h1>{title}</h1>
        {updated ? <p className="policy-updated">{updated}</p> : null}
        <Link className="policy-back" to={localize('/policies')}>
          {t('← All policies')}
        </Link>
      </div>
      <article
        className="policy-content"
        dangerouslySetInnerHTML={{__html: body}}
      />
    </div>
  );
}

// NOTE: https://shopify.dev/docs/api/storefront/latest/objects/Shop
const POLICY_CONTENT_QUERY = `#graphql
  fragment Policy on ShopPolicy {
    body
    handle
    id
    title
    url
  }
  query Policy(
    $country: CountryCode
    $language: LanguageCode
    $privacyPolicy: Boolean!
    $refundPolicy: Boolean!
    $shippingPolicy: Boolean!
    $termsOfService: Boolean!
  ) @inContext(language: $language, country: $country) {
    shop {
      privacyPolicy @include(if: $privacyPolicy) {
        ...Policy
      }
      shippingPolicy @include(if: $shippingPolicy) {
        ...Policy
      }
      termsOfService @include(if: $termsOfService) {
        ...Policy
      }
      refundPolicy @include(if: $refundPolicy) {
        ...Policy
      }
    }
  }
` as const;
