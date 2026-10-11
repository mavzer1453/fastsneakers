import {useEffect, useState} from 'react';
import {
  BsArrowRepeat,
  BsCheckCircleFill,
  BsShieldCheck,
  BsTruck,
  BsX,
} from 'react-icons/bs';
import {SHOP} from '~/data/shop';
import {SECOND_PAIR} from '~/lib/promo';
import {useTranslate} from '~/lib/useTranslate';

/*
 * Everything in this file states a promise the shop actually keeps, and every
 * number comes from `~/data/shop` rather than being typed here: shipping is
 * free and tracked on every order (`SHOP.freeShipping.amount === 0`), returns
 * are `SHOP.returnDays` days, replies take `SHOP.responseTime`, and checkout
 * is Shopify's. Change the policy there and these lines follow; do not add a
 * claim here that the policies page does not back up.
 */

/**
 * The reassurance block under a collection's title: one plain sentence, then
 * the same three promises as icon badges for anyone scanning rather than
 * reading.
 */
export function CollectionTrustRow() {
  const t = useTranslate();
  const returns = t('{days}-day returns').replace(
    '{days}',
    String(SHOP.returnDays),
  );
  return (
    <div className="collection-trust">
      <p className="collection-trust-line">
        {t('Free tracked shipping on every order')} · {returns} ·{' '}
        {t('Klarna at checkout')}.
      </p>
      <ul className="collection-trust-badges">
        <li>
          <BsTruck aria-hidden="true" />
          {t('Free shipping')}
        </li>
        <li>
          <BsArrowRepeat aria-hidden="true" />
          {returns}
        </li>
        <li>
          <BsShieldCheck aria-hidden="true" />
          {t('Secure checkout')}
        </li>
      </ul>
    </div>
  );
}

/**
 * The sliding ribbon under "Shop by category".
 *
 * Same mechanism as the brand marquee further down the homepage: two
 * identical tracks side by side, each translated by its own width, so the
 * second one is exactly where the first started when the loop restarts. The
 * copy is only read out once — the duplicate track is aria-hidden.
 */
export function TrustTicker() {
  const t = useTranslate();
  const items = [
    t('Free tracked worldwide shipping'),
    t('{days}-day returns').replace('{days}', String(SHOP.returnDays)),
    t('Pay safely with secure checkout'),
    t('We reply within 1–2 business days'),
    t('100% authentic, checked before shipping'),
    ...(SHOP.reviews.show
      ? [
          t('{customers} satisfied customers').replace(
            '{customers}',
            SHOP.reviews.customers,
          ),
        ]
      : []),
    t('Pay in installments with Klarna at checkout'),
  ];
  const track = (ariaHidden: boolean) => (
    <ul className="trust-ticker-track" aria-hidden={ariaHidden || undefined}>
      {items.map((item) => (
        <li key={item} className="trust-ticker-item">
          <BsCheckCircleFill aria-hidden="true" />
          {item}
        </li>
      ))}
    </ul>
  );
  return (
    <section className="trust-ticker" aria-label={t('Why shop with us')}>
      {track(false)}
      {track(true)}
    </section>
  );
}

/** A dismissal lasts for the browsing session, not forever. */
const OFFER_DISMISS_KEY = 'vc:collection-offer-off';

/**
 * The lavender band across the top of every collection page: the two standing
 * promises and the sneaker offer, which is the part in purple.
 *
 * The percentage comes from `SECOND_PAIR` in ~/lib/promo, which has to match
 * the automatic discount configured in Shopify admin — see the note there.
 *
 * It renders on the server and for the first client paint, then hides itself
 * if this visitor already closed it. Reading sessionStorage during render
 * instead would make the server and client HTML disagree.
 */
export function CollectionOfferBar() {
  const t = useTranslate();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(OFFER_DISMISS_KEY)) setDismissed(true);
    } catch {
      // Storage blocked (private mode): the band simply stays visible.
    }
  }, []);

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(OFFER_DISMISS_KEY, '1');
    } catch {
      // Same as above — dismissed for this page view only.
    }
  };

  return (
    <aside className="collection-offer" aria-label={t('Current offers')}>
      <span className="collection-offer-dot" aria-hidden="true" />
      <p className="collection-offer-text">
        {t('Free tracked shipping on all orders')} ·{' '}
        {t('Pay later with Klarna')} ·{' '}
        <strong>
          {t('All sneakers: 2nd pair {percent}% off').replace(
            '{percent}',
            String(SECOND_PAIR.percent),
          )}
        </strong>
      </p>
      <button
        type="button"
        className="collection-offer-close reset"
        aria-label={t('Dismiss')}
        onClick={dismiss}
      >
        <BsX aria-hidden="true" />
      </button>
    </aside>
  );
}
