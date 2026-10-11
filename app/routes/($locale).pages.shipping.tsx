import {Link} from 'react-router';
import type {Route} from './+types/($locale).pages.shipping';
import {useLocalizedHref} from '~/lib/localizedLink';
import {buildMeta} from '~/lib/seo';
import {SHOP} from '~/data/shop';
import {REST_ZONE, SHIPPING_ZONES} from '~/lib/shipping';
import {useTranslate} from '~/lib/useTranslate';

export const meta: Route.MetaFunction = ({matches, location}) => {
  return buildMeta(
    {matches, pathname: location.pathname},
    {
      title: 'Shipping & delivery',
      description:
        'Free shipping on every order, worldwide — no minimum, import duties included. Dispatched within 1–3 business days, delivered in 5–15 business days, always tracked.',
    },
  );
};

const ALL_ZONES = [...SHIPPING_ZONES, REST_ZONE];



export default function ShippingPage() {
  const localize = useLocalizedHref();
  const t = useTranslate();
  return (
    <div className="shipping-page page-container">
      <div className="page-header">
        <span className="eyebrow">{t('Delivery')}</span>
        <h1>{t('Shipping & delivery')}</h1>
        <p>
          {t(
            'Every order is shipped with track & trace, and shipping is free on every order, to every destination we deliver to — no minimum, no codes.',
          )}
        </p>
      </div>

      {/* Order → shipped → delivered, one glance */}
      <ol className="ship-steps" aria-label={t('How delivery works')}>
        <li>
          <span className="ship-step-no">1</span>
          <div>
            <strong>{t('Order placed')}</strong>
            <span>{t('Confirmation in your inbox right away')}</span>
          </div>
        </li>
        <li>
          <span className="ship-step-no">2</span>
          <div>
            <strong>{t('Shipped in 1–3 business days')}</strong>
            <span>{t('Track & trace link the moment it leaves')}</span>
          </div>
        </li>
        <li>
          <span className="ship-step-no">3</span>
          <div>
            <strong>{t('Delivered in 5–15 business days')}</strong>
            <span>{t('Tracked to your door, every order')}</span>
          </div>
        </li>
      </ol>

      <section className="ship-rates-section">
        <div className="ship-rates-head">
          <h2>{t('Rates per destination')}</h2>
          <p>
            {t(
              'Applied automatically at checkout — no minimum order value, no codes needed.',
            )}
          </p>
        </div>

        <div className="ship-table-scroll">
          <table className="ship-table">
            <thead>
              <tr>
                <th scope="col">{t('Destination')}</th>
                <th scope="col">{t('Shipping')}</th>
              </tr>
            </thead>
            <tbody>
              {ALL_ZONES.map((zone) => (
                <tr key={zone.key}>
                  <th scope="row">{zone.label}</th>
                  <td className="ship-table-free">
                    {t('Free')}
                    <small>{t('every order')}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ship-table-note">
          {t(
            'Shipping is free worldwide, whatever the order value and whatever the destination. Nothing is added at checkout.',
          )}
        </p>
      </section>

      <section className="ship-info-section">
        <h2>{t('The details')}</h2>
        <div className="ship-info-grid">
          <div className="ship-info-card">
            <h3>{t('Processing & delivery')}</h3>
            <p>
              {t(
                'Orders are picked, verified and handed to the carrier within 1–3 business days. Delivery then takes up to 15 business days, depending on the destination and carrier.',
              )}
            </p>
          </div>
          <div className="ship-info-card">
            <h3>{t('Tracking')}</h3>
            <p>
              {t(
                'You’ll receive a track & trace link by email as soon as your parcel ships. You can also follow it under',
              )}{' '}
              <Link to={localize('/pages/track-order')}>
                {t('Track my order')}
              </Link>
              .
            </p>
          </div>
          <div className="ship-info-card">
            <h3>{t('Customs outside the EU')}</h3>
            <p>
              {t(
                'Within the European Union all prices include VAT. For destinations outside the EU — such as the United Kingdom, Switzerland, Norway, Türkiye, the United States and Canada — we pay any import duties and taxes ourselves. There is nothing extra to pay at checkout or on delivery.',
              )}
            </p>
          </div>
          <div className="ship-info-card">
            <h3>{t('Questions or issues')}</h3>
            <p>
              {t(SHOP.responseTime)} —{' '}
              <Link to={localize('/pages/contact')}>{t('contact us')}</Link>{' '}
              {t('and we’ll sort it out. Formal terms are in the')}{' '}
              <Link to={localize('/policies/shipping-policy')}>
                {t('shipping policy')}
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
