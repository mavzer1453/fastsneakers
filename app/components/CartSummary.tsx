import type {CartApiQueryFragment} from 'storefrontapi.generated';
import type {CartLayout} from '~/components/CartMain';
import {Money, useAnalytics, type OptimisticCart} from '@shopify/hydrogen';
import {readCookie, TTCLID_COOKIE} from '~/lib/tiktok';
import {useId} from 'react';
import {PaymentIcons} from '~/components/PaymentIcons';
import {KlarnaLine} from '~/components/KlarnaLine';
import {ReviewBadge} from '~/components/ReviewBadge';
import {SHOP} from '~/data/shop';
import {
  approxFromEur,
  approxToEur,
  dutiesFor,
  formatEur,
  formatMoney,
  freeShippingThreshold,
  hasDuties,
  shippingPriceFor,
  zoneForCountry,
} from '~/lib/shipping';
import {useTranslate} from '~/lib/useTranslate';

type CartSummaryProps = {
  cart: OptimisticCart<CartApiQueryFragment | null>;
  layout: CartLayout;
};

export function CartSummary({cart, layout}: CartSummaryProps) {
  const t = useTranslate();
  const className =
    layout === 'page' ? 'cart-summary-page' : 'cart-summary-aside';
  const summaryId = useId();

  const subtotal = cart?.cost?.subtotalAmount;
  const grandTotal = cart?.cost?.totalAmount ?? subtotal;
  const currency = grandTotal?.currencyCode ?? 'EUR';

  // Quantity clicks update line.quantity INSTANTLY (optimistic UI) while
  // every `cost` amount stays at the old server value until the round-trip
  // finishes. Mixing the two made "You save" spike and snap back. So both
  // sides of the math come from the same per-line source: unit price ×
  // quantity — always internally consistent, optimistic or not.
  let actualSum = 0;
  for (const line of cart?.lines?.nodes ?? []) {
    const qty = typeof line.quantity === 'number' ? line.quantity : 1;
    const unit = line.cost?.amountPerQuantity;
    const compare = line.cost?.compareAtAmountPerQuantity ?? unit;
    if (unit?.amount) actualSum += parseFloat(unit.amount) * qty;
  }
  const isOptimistic = Boolean(
    (cart as {isOptimistic?: boolean} | null)?.isOptimistic,
  );
  // Settled carts use the server total (it also reflects discount codes);
  // during the optimistic window the line-derived sum keeps numbers sane.
  const totalNum =
    !isOptimistic && grandTotal?.amount
      ? parseFloat(grandTotal.amount)
      : actualSum;

  // Shipping estimate for this subtotal + destination. EUR is exact; other
  // display currencies show an approximate conversion (checkout is final).
  const zone = zoneForCountry(cart?.buyerIdentity?.countryCode);
  const subtotalNum =
    !isOptimistic && subtotal?.amount ? parseFloat(subtotal.amount) : actualSum;
  const eurSubtotal =
    subtotalNum > 0
      ? currency === 'EUR'
        ? subtotalNum
        : approxToEur(subtotalNum, currency)
      : null;
  const shippingEur =
    eurSubtotal !== null ? shippingPriceFor(zone, eurSubtotal) : null;
  const inEur = (amountEur: number) =>
    currency === 'EUR'
      ? formatEur(amountEur)
      : `≈ ${formatMoney(approxFromEur(amountEur, currency), currency)}`;
  const shippingLabel =
    shippingEur === null
      ? t('Calculated at checkout')
      : shippingEur === 0
        ? t('Free')
        : inEur(shippingEur);

  // US and Canadian orders clear customs as imports. Shipping is still free;
  // the import charge is billed separately at checkout under the same name
  // the Shopify rate carries, so the two screens read alike. Like the shipping
  // estimate above it sits outside the cart total, which Shopify computes
  // before delivery is chosen.
  const country = cart?.buyerIdentity?.countryCode;
  const dutiesEur =
    eurSubtotal !== null ? dutiesFor(country, eurSubtotal) : null;
  const dutiesLabel = hasDuties(country)
    ? dutiesEur === null
      ? 'Calculated at checkout'
      : inEur(dutiesEur)
    : null;

  return (
    <div role="region" aria-labelledby={summaryId} className={className}>
      <h4 id={summaryId} className="sr-only">
        {t('Order summary')}
      </h4>
      <dl className="cart-totals">
        {/* Free shipping is confirmed in green at the top of the cart, so
            repeating it here is the duplicate line shoppers noticed. The row
            stays for the cases that actually carry information: a real
            shipping cost, or one Shopify has yet to calculate. */}
        {shippingEur === 0 ? null : (
          <div className="cart-totals-row">
            <dt>{t('Shipping')}</dt>
            <dd>{shippingLabel}</dd>
          </div>
        )}
        {dutiesLabel ? (
          <div className="cart-totals-row">
            <dt>{t('Duties & handling')}</dt>
            <dd>{dutiesLabel}</dd>
          </div>
        ) : null}
        <div className="cart-totals-row cart-totals-total">
          <dt>{t('Total')}</dt>
          <dd>
            {totalNum > 0 ? (
              <Money
                data={{
                  amount: totalNum.toFixed(2),
                  currencyCode: currency as never,
                }}
              />
            ) : (
              '—'
            )}
          </dd>
        </div>
      </dl>
      <CartCheckoutActions cart={cart} checkoutUrl={cart?.checkoutUrl} />
    </div>
  );
}

/**
 * Progress toward free shipping, using the REAL rate table for the
 * shopper's selected country (falls back to NL). Shown at the TOP of the
 * cart — see CartMain. Works in every display currency: non-EUR carts get
 * an approximate conversion (marked with ≈); checkout stays authoritative.
 */
/** The green tick used by both states of the meter. */
function FreeCheck() {
  return (
    <svg
      className="cart-shipping-check"
      viewBox="0 0 24 24"
      width="15"
      height="15"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path
        d="m7.6 12.3 2.9 2.9 5.9-6"
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FreeShippingMeter({
  subtotal,
  countryCode,
}: {
  subtotal?: {amount?: string | null; currencyCode?: string | null} | null;
  countryCode?: string | null;
}) {
  const t = useTranslate();
  if (!subtotal?.amount) return null;
  const raw = parseFloat(subtotal.amount);
  if (Number.isNaN(raw) || raw <= 0) return null;

  const currency = subtotal.currencyCode ?? 'EUR';
  const isEur = currency === 'EUR';
  const eurAmount = isEur ? raw : approxToEur(raw, currency);
  if (eurAmount === null) return null;

  const zone = zoneForCountry(countryCode);
  const freeAt = freeShippingThreshold(zone);
  /*
   * freeAt of 0 means shipping is free on this zone's every order. A progress
   * bar would sit at 100% from first paint and never move, so drop the bar
   * and state it — the green confirmation is the useful half. Zones that do
   * have a threshold keep the meter below.
   */
  if (freeAt <= 0) {
    return (
      <div className="cart-shipping-meter is-unlocked is-always-free">
        <p>
          <FreeCheck />
          {t('Free shipping')}
        </p>
        <div
          className="cart-shipping-meter-track"
          role="progressbar"
          aria-valuenow={100}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('Free shipping unlocked')}
        >
          <span style={{width: '100%'}} />
        </div>
      </div>
    );
  }
  const remainingEur = Math.max(0, freeAt - eurAmount);
  const percent =
    freeAt <= 0 ? 100 : Math.min(100, Math.round((eurAmount / freeAt) * 100));
  const unlocked = remainingEur <= 0;

  const remainingLabel = isEur
    ? formatEur(remainingEur)
    : `≈ ${formatMoney(approxFromEur(remainingEur, currency), currency)}`;

  return (
    <div className={`cart-shipping-meter${unlocked ? ' is-unlocked' : ''}`}>
      <p>
        {unlocked ? (
          <>
            <FreeCheck />
            {t('Free shipping unlocked')}
          </>
        ) : (
          <>
            Add <strong>{remainingLabel}</strong> for free shipping
          </>
        )}
      </p>
      <div
        className="cart-shipping-meter-track"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('Free shipping unlocked')}
      >
        <span style={{width: `${percent}%`}} />
      </div>
    </div>
  );
}


function CartCheckoutActions({
  cart,
  checkoutUrl,
}: {
  cart: OptimisticCart<CartApiQueryFragment | null>;
  checkoutUrl?: string;
}) {
  const t = useTranslate();
  const {publish} = useAnalytics();

  if (!checkoutUrl) return null;

  /**
   * Forward the TikTok click id across the storefront -> checkout hop.
   * The cookie is already root-domain scoped, but Safari's ITP can clip
   * cookie lifetimes, so we also carry it in the URL as a fallback.
   */
  const hrefWithClickId = (() => {
    if (typeof window === 'undefined') return checkoutUrl;
    const ttclid = readCookie(TTCLID_COOKIE);
    if (!ttclid) return checkoutUrl;
    try {
      const url = new URL(checkoutUrl);
      if (!url.searchParams.has('ttclid')) url.searchParams.set('ttclid', ttclid);
      return url.toString();
    } catch {
      return checkoutUrl;
    }
  })();

  /* The cart's money fields are optional all the way down; KlarnaLine wants a
     complete MoneyV2 or nothing at all. */
  const cartTotal = cart?.cost?.totalAmount;
  const klarnaPrice =
    cartTotal?.amount && cartTotal.currencyCode
      ? {amount: cartTotal.amount, currencyCode: cartTotal.currencyCode}
      : undefined;

  return (
    <div className="cart-checkout">
      <KlarnaLine
        price={klarnaPrice}
        buyerCountry={cart?.buyerIdentity?.countryCode}
      />
      <a
        href={hrefWithClickId}
        target="_self"
        className="btn cart-checkout-btn"
        onClick={() => {
          // Fire InitiateCheckout before the browser leaves for Shopify's
          // checkout. This is the last event we control on our own domain.
          publish('custom_checkout_started', {cart});
        }}
      >
        <svg
          className="cart-checkout-lock"
          viewBox="0 0 24 24"
          width="17"
          height="17"
          aria-hidden="true"
        >
          <path
            d="M7 10V8a5 5 0 0 1 10 0v2"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <rect x="4.5" y="10" width="15" height="10.5" rx="2.5" fill="currentColor" />
        </svg>
        {t('Continue to checkout')}
      </a>
      {/* Three short guarantees, none of which repeat a line the totals
          above already carry — the "Shipping — Free" row states that, so
          saying it again here is the duplication this block had before. */}
      <p className="cart-checkout-trust">
        <span>{t('Secure checkout')}</span>
        <span>
          {t('{days}-day returns').replace('{days}', String(SHOP.returnDays))}
        </span>
        <span>{t('100% authentic')}</span>
      </p>
      <PaymentIcons />
      <div className="cart-checkout-rating">
        <ReviewBadge compact />
      </div>
    </div>
  );
}


