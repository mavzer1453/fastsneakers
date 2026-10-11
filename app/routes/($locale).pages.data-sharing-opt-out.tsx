import {useEffect, useState} from 'react';
import {Link} from 'react-router';
import type {Route} from './+types/($locale).pages.data-sharing-opt-out';
import {useLocalizedHref} from '~/lib/localizedLink';
import {buildMeta} from '~/lib/seo';
import {SHOP} from '~/data/shop';
import {useTranslate} from '~/lib/useTranslate';

/**
 * "Your privacy choices" — the opt-out page the Shopify privacy policy links
 * to. On a Liquid theme Shopify renders this page itself; on Hydrogen we have
 * to, otherwise the link in the privacy policy is a dead end.
 *
 * Uses the Customer Privacy API that `withPrivacyBanner` in root.tsx loads
 * (`window.Shopify.customerPrivacy`).
 */

type CustomerPrivacy = {
  setTrackingConsent?: (
    consent: Record<string, boolean>,
    callback?: (result?: {error?: string}) => void,
  ) => void;
  saleOfDataAllowed?: () => boolean;
};

function customerPrivacy(): CustomerPrivacy | undefined {
  return (window as unknown as {Shopify?: {customerPrivacy?: CustomerPrivacy}})
    .Shopify?.customerPrivacy;
}

export const meta: Route.MetaFunction = ({matches, location}) => {
  return buildMeta(
    {matches, pathname: location.pathname},
    {
      title: 'Your privacy choices',
      description:
        'Opt out of the sale or sharing of your personal information for targeted advertising, and manage your cookie preferences.',
    },
  );
};

export default function DataSharingOptOut() {
  const t = useTranslate();
  const localize = useLocalizedHref();
  const [optedOut, setOptedOut] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const api = customerPrivacy();
    if (api?.saleOfDataAllowed && !api.saleOfDataAllowed()) setOptedOut(true);
  }, []);

  const optOut = () => {
    const api = customerPrivacy();
    if (!api?.setTrackingConsent) {
      setError(true);
      return;
    }
    api.setTrackingConsent(
      {sale_of_data: false, marketing: false},
      (result) => {
        if (result?.error) setError(true);
        else setOptedOut(true);
      },
    );
  };

  const openPreferences = () => {
    (
      window as unknown as {privacyBanner?: {showPreferences?: () => void}}
    ).privacyBanner?.showPreferences?.();
  };

  return (
    <div className="policy-page section">
      <div className="policy-page-header">
        <span className="eyebrow">{t('Legal')}</span>
        <h1>{t('Your privacy choices')}</h1>
        <Link className="policy-back" to={localize('/policies')}>
          {t('← All policies')}
        </Link>
      </div>
      <article className="policy-content">
        <p>
          Depending on where you live, you may have the right to opt out of the
          “sale” or “sharing” of your personal information for targeted
          advertising. Use the button below to opt out for this browser and
          device. You can also change which cookies you accept at any time.
        </p>
        <p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={optOut}
            disabled={optedOut}
          >
            {optedOut ? t('You have opted out') : t('Opt out')}
          </button>{' '}
          <button type="button" className="btn" onClick={openPreferences}>
            {t('Cookie preferences')}
          </button>
        </p>
        {error ? (
          <p>
            We couldn’t save your choice automatically. Please email{' '}
            <a href={`mailto:${SHOP.email}`}>{SHOP.email}</a> and we will
            process your request.
          </p>
        ) : null}
        <p>
          More detail is in our{' '}
          <Link to={localize('/policies/privacy-policy')}>Privacy policy</Link>.
        </p>
      </article>
    </div>
  );
}
