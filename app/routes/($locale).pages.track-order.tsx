import {Link} from 'react-router';
import type {Route} from './+types/($locale).pages.track-order';
import {useLocalizedHref} from '~/lib/localizedLink';
import {buildMeta} from '~/lib/seo';
import {SHOP} from '~/data/shop';
import {useTranslate} from '~/lib/useTranslate';

/**
 * Guest order tracking — no account, no password.
 *
 * The lookup itself is handled by the tracking app mounted on the Shopify
 * app-proxy path. That page cannot be embedded (it answers with
 * `X-Frame-Options: DENY` and `frame-ancestors 'none'`), and the Storefront
 * API has no anonymous order lookup, so the honest shape is this: our own
 * branded form, submitted straight to the app with the fields it expects.
 *
 * Both forms are plain GET — no JavaScript, so they work on a dead-slow
 * connection and are indexable. The app reads either `order` + `email`, or
 * `nums` for a bare tracking number.
 */

const TRACKING_ENDPOINT =
  'https://checkout.vesperacollectives.com/apps/parcelpanel';

export const meta: Route.MetaFunction = ({matches, location}) => {
  return buildMeta(
    {matches, pathname: location.pathname},
    {
      title: 'Track your order',
      description:
        'Follow your parcel with your order number and email, or with the tracking number from your shipping confirmation. No account needed.',
    },
  );
};

export default function TrackOrderPage() {
  const localize = useLocalizedHref();
  const t = useTranslate();

  return (
    <div className="track-page page-container">
      <div className="page-header">
        <span className="eyebrow">{t('Order tracking')}</span>
        <h1>{t('Track your order')}</h1>
        <p>
          {t(
            'No account needed. Use your order number and email, or the tracking number from your shipping confirmation. Tracking usually goes live within {shipsWithin} of your order being placed.',
          ).replace('{shipsWithin}', t(SHOP.shipsWithin))}
        </p>
      </div>

      <div className="track-grid">
        <section className="track-card">
          <h2>{t('With your order number')}</h2>
          <p className="track-card-note">
            {t('Your order number is in your confirmation email — it looks like')}
            <strong> #1024</strong>.
          </p>
          <form action={TRACKING_ENDPOINT} method="get" className="track-form">
            <label className="track-field">
              <span>{t('Order number')}</span>
              <input
                type="text"
                name="order"
                placeholder="#1024"
                autoComplete="off"
                required
              />
            </label>
            <label className="track-field">
              <span>{t('Email or phone number')}</span>
              <input
                type="text"
                name="email"
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </label>
            <button type="submit" className="btn btn-dark track-submit">
              {t('Track my order')}
            </button>
          </form>
        </section>

        <div className="track-divider" aria-hidden="true">
          <span>{t('or')}</span>
        </div>

        <section className="track-card">
          <h2>{t('With a tracking number')}</h2>
          <p className="track-card-note">
            {t('Sent to you by email as soon as the parcel leaves the warehouse.')}
          </p>
          <form action={TRACKING_ENDPOINT} method="get" className="track-form">
            <label className="track-field">
              <span>{t('Tracking number')}</span>
              <input
                type="text"
                name="nums"
                placeholder="e.g. LP00123456789"
                autoComplete="off"
                required
              />
            </label>
            <button type="submit" className="btn btn-dark track-submit">
              {t('Track parcel')}
            </button>
          </form>
        </section>
      </div>

      <section className="track-help">
        <h2>{t('Nothing showing yet?')}</h2>
        <ul>
          <li>
            {t(
              'A tracking number can take up to 3 days to register with the carrier after it is issued. Until then it may return no results.',
            )}
          </li>
          <li>
            {t(
              'Orders ship within {shipsWithin}. Typical delivery is {deliveryEstimate} once the parcel is on its way.',
            )
              .replace('{shipsWithin}', t(SHOP.shipsWithin))
              .replace('{deliveryEstimate}', t(SHOP.deliveryEstimate))}
          </li>
          <li>
            {t(
              'Ordered more than one item? They can travel separately, so you may get more than one tracking number.',
            )}
          </li>
        </ul>
        <p>
          {t('Still stuck? Email')}{' '}
          <a href={`mailto:${SHOP.email}`}>{SHOP.email}</a>{' '}
          {t('with your order number and we will look it up for you — or use the')}{' '}
          <Link to={localize('/pages/contact')}>{t('contact form')}</Link>.{' '}
          {t('You can also see every order in')}{' '}
          <Link to={localize('/account/orders')}>{t('your account')}</Link>{' '}
          {t('if you have one.')}
        </p>
      </section>
    </div>
  );
}
