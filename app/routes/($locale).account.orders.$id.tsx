import {redirect, useLoaderData} from 'react-router';
import type {Route} from './+types/($locale).account.orders.$id';
import {Money, Image} from '@shopify/hydrogen';
import type {
  OrderLineItemFullFragment,
  OrderQuery,
} from 'customer-accountapi.generated';
import {CUSTOMER_ORDER_QUERY} from '~/graphql/customer-account/CustomerOrderQuery';
import {localizePath} from '~/lib/i18n';
import {splitBrandTitle} from '~/lib/brand';
import {useTranslate} from '~/lib/useTranslate';

export const meta: Route.MetaFunction = ({data}) => {
  return [{title: `Order ${data?.order?.name}`}];
};

export async function loader({params, context}: Route.LoaderArgs) {
  const {customerAccount} = context;
  if (!params.id) {
    return redirect(localizePath('/account/orders', context.storefront.i18n));
  }

  const orderId = atob(params.id);
  const {data, errors}: {data: OrderQuery; errors?: Array<{message: string}>} =
    await customerAccount.query(CUSTOMER_ORDER_QUERY, {
      variables: {
        orderId,
        language: customerAccount.i18n.language,
      },
    });

  if (errors?.length || !data?.order) {
    throw new Response('Order not found', {status: 404});
  }

  const {order} = data;
  const lineItems = order.lineItems.nodes;
  const discountApplications = order.discountApplications.nodes;
  const firstDiscount = discountApplications[0]?.value;

  const discountValue =
    firstDiscount?.__typename === 'MoneyV2'
      ? (firstDiscount as Extract<
          typeof firstDiscount,
          {__typename: 'MoneyV2'}
        >)
      : null;

  const discountPercentage =
    firstDiscount?.__typename === 'PricingPercentageValue'
      ? (
          firstDiscount as Extract<
            typeof firstDiscount,
            {__typename: 'PricingPercentageValue'}
          >
        ).percentage
      : null;

  // Human label for the order-level discount: the code the customer typed
  // or the automatic/manual promotion's title.
  const firstApplication = discountApplications[0] as
    | {code?: string | null; title?: string | null}
    | undefined;
  const discountLabel =
    firstApplication?.code ?? firstApplication?.title ?? null;

  return {
    order,
    lineItems,
    discountValue,
    discountPercentage,
    discountLabel,
  };
}

/** Branded tracking page, served by the tracking app on the Shopify domain. */
const TRACKING_ENDPOINT =
  'https://checkout.fastsneakers.com/apps/parcelpanel';

/**
 * "Track order" goes somewhere useful in both states.
 *
 * Once the parcel has a tracking number we already know it — sending the
 * customer to a form to type it back in is busywork, so the link opens the
 * branded tracking page straight on that parcel. Before it ships there is
 * nothing to look up, so it goes to our own tracking page, which explains
 * the wait rather than returning an empty result.
 *
 * The carrier's own `trackingInformation.url` is deliberately ignored: it
 * would drop the customer on a third-party site, which is the thing the
 * branded page exists to avoid.
 */
function TrackOrderLink({order}: {order: NonNullable<OrderQuery['order']>}) {
  const t = useTranslate();
  const tracking = order.fulfillments?.nodes?.[0]?.trackingInformation?.find(
    (entry) => entry?.number,
  );

  const href = tracking?.number
    ? `${TRACKING_ENDPOINT}?nums=${encodeURIComponent(tracking.number)}`
    : '/pages/track-order';

  return (
    <a className="btn btn-ghost order-status-btn" href={href}>
      {t('Track order →')}
    </a>
  );
}

/**
 * Where the order stands, as stepper milestones:
 * Ordered → Processing → Shipped → Delivered.
 * Returns the index of the last COMPLETED step (0-based).
 */
function progressFor(order: OrderQuery['order']): number {
  if (!order) return 0;
  const paid = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(
    order.financialStatus ?? '',
  );
  const shipped =
    order.fulfillmentStatus === 'FULFILLED' ||
    (order.fulfillments?.nodes?.length ?? 0) > 0;
  const delivered =
    order.fulfillments?.nodes?.[0]?.latestShipmentStatus === 'DELIVERED';

  if (delivered) return 3;
  if (shipped) return 2;
  if (paid) return 1;
  return 0;
}

const STEPS = ['Ordered', 'Processing', 'Shipped', 'Delivered'];

/** Horizontal progress stepper — checkmark nodes joined by a track. */
function OrderStepper({completedIndex}: {completedIndex: number}) {
  const t = useTranslate();
  return (
    <ol className="order-stepper" aria-label={t('Order progress')}>
      {STEPS.map((label, index) => {
        const done = index <= completedIndex;
        const current = index === completedIndex + 1;
        return (
          <li
            key={label}
            className={`order-step${done ? ' is-done' : ''}${
              current ? ' is-current' : ''
            }`}
            aria-current={current ? 'step' : undefined}
          >
            <span className="order-step-node" aria-hidden="true">
              {done ? (
                <svg viewBox="0 0 24 24" width="14" height="14">
                  <path
                    d="m5.5 12.5 4.2 4.2 8.8-9.4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                index + 1
              )}
            </span>
            <span className="order-step-label">{t(label)}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function OrderRoute() {
  const {order, lineItems, discountValue, discountPercentage, discountLabel} =
    useLoaderData<typeof loader>();
  const t = useTranslate();
  const completed = progressFor(order);
  const paid = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(
    order.financialStatus ?? '',
  );

  // Item-level savings (automatic deals, per-product codes) summed across
  // all lines — shown as their own row, Shopify-style.
  const currency =
    order.totalPrice?.currencyCode ??
    order.subtotal?.currencyCode ??
    ('EUR' as const);
  let itemSavings = 0;
  for (const line of lineItems) {
    if (line.totalDiscount?.amount)
      itemSavings += parseFloat(line.totalDiscount.amount);
  }
  const orderDiscountAmount = discountValue?.amount
    ? parseFloat(discountValue.amount)
    : 0;
  const totalSaved = itemSavings + orderDiscountAmount;
  const shippingAmount = order.totalShipping?.amount
    ? parseFloat(order.totalShipping.amount)
    : null;

  return (
    <div className="account-order">
      {/* Head: number, date, status pills */}
      <div className="order-head">
        <div>
          <h2>
            {t('Order')} {order.name}
          </h2>
          <p className="order-head-meta">
            {t('Placed on')}{' '}
            {new Date(order.processedAt!).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
            {order.confirmationNumber ? (
              <>
                {' '}
                · {t('Confirmation')} {order.confirmationNumber}
              </>
            ) : null}
          </p>
        </div>
        <div className="order-head-badges">
          {paid ? (
            <span className="order-badge is-paid">{t('Paid')}</span>
          ) : null}
          <TrackOrderLink order={order} />
        </div>
      </div>

      <OrderStepper completedIndex={completed} />

      {/* Items */}
      <section className="order-panel">
        <h3>
          {lineItems.length}{' '}
          {lineItems.length === 1 ? t('item') : t('items')}
        </h3>
        <ul className="order-lines">
          {lineItems.map((lineItem) => (
            <OrderLine key={lineItem.id} lineItem={lineItem} />
          ))}
        </ul>
      </section>

      <div className="order-columns">
        {/* Totals */}
        <section className="order-panel">
          <h3>{t('Summary')}</h3>
          <dl className="order-totals">
            <div className="order-totals-row">
              <dt>{t('Subtotal')}</dt>
              <dd>{order.subtotal ? <Money data={order.subtotal} /> : '—'}</dd>
            </div>
            {itemSavings > 0.005 ? (
              <div className="order-totals-row is-discount">
                <dt>{t('Item discounts')}</dt>
                <dd>
                  −
                  <Money
                    data={{
                      amount: itemSavings.toFixed(2),
                      currencyCode: currency as never,
                    }}
                  />
                </dd>
              </div>
            ) : null}
            {discountValue?.amount || discountPercentage ? (
              <div className="order-totals-row is-discount">
                <dt>
                  {t('Discount')}
                  {discountLabel ? (
                    <span className="order-totals-code">{discountLabel}</span>
                  ) : null}
                </dt>
                <dd>
                  {discountPercentage ? (
                    <span>−{discountPercentage}%</span>
                  ) : (
                    discountValue && (
                      <>
                        −<Money data={discountValue} />
                      </>
                    )
                  )}
                </dd>
              </div>
            ) : null}
            <div className="order-totals-row">
              <dt>{t('Shipping')}</dt>
              <dd>
                {shippingAmount === null ? (
                  '—'
                ) : shippingAmount === 0 ? (
                  t('Free')
                ) : (
                  <Money data={order.totalShipping!} />
                )}
              </dd>
            </div>
            <div className="order-totals-row">
              <dt>{t('Tax')}</dt>
              <dd>{order.totalTax ? <Money data={order.totalTax} /> : '—'}</dd>
            </div>
            <div className="order-totals-row is-total">
              <dt>{t('Total')}</dt>
              <dd>
                {order.totalPrice ? <Money data={order.totalPrice} /> : '—'}
              </dd>
            </div>
            {totalSaved > 0.005 ? (
              <div className="order-totals-row is-saved-note">
                <dt>{t('You saved')}</dt>
                <dd>
                  −
                  <Money
                    data={{
                      amount: totalSaved.toFixed(2),
                      currencyCode: currency as never,
                    }}
                  />
                </dd>
              </div>
            ) : null}
          </dl>
        </section>

        {/* Shipping to (only the destination — never the origin) */}
        <section className="order-panel">
          <h3>{t('Shipping to')}</h3>
          {order?.shippingAddress ? (
            <address className="order-address">
              {(order.shippingAddress.formatted ?? []).map((line) => (
                <span key={line}>{line}</span>
              ))}
            </address>
          ) : (
            <p className="order-address-empty">
              {t('No shipping address defined')}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function OrderLine({lineItem}: {lineItem: OrderLineItemFullFragment}) {
  const t = useTranslate();
  const {brand, rest} = splitBrandTitle(lineItem.title);
  const meta = [
    lineItem.sku ? `SKU ${lineItem.sku}` : null,
    lineItem.variantTitle && lineItem.variantTitle !== 'Default Title'
      ? lineItem.variantTitle
      : null,
    `Qty ${lineItem.quantity}`,
  ].filter(Boolean);

  // What THIS item saved (per-line discount) and which promotion did it.
  const savedAmount = lineItem.totalDiscount?.amount
    ? parseFloat(lineItem.totalDiscount.amount)
    : 0;
  const allocation = lineItem.discountAllocations?.[0]?.discountApplication as
    | {code?: string | null; title?: string | null}
    | undefined;
  const savedLabel = allocation?.code ?? allocation?.title ?? t('Discount');

  return (
    <li className="order-line">
      <div className="order-line-media">
        {lineItem?.image ? (
          <Image data={lineItem.image} width={64} height={64} />
        ) : (
          <span className="order-line-media-empty" aria-hidden="true" />
        )}
      </div>
      <div className="order-line-body">
        {brand ? <span className="order-line-brand">{brand}</span> : null}
        <span className="order-line-title">{rest}</span>
        <span className="order-line-meta">{meta.join(' · ')}</span>
        {savedAmount > 0.005 && lineItem.totalDiscount ? (
          <span className="order-line-saving">
            {savedLabel} · −<Money data={lineItem.totalDiscount} />
          </span>
        ) : null}
      </div>
      <div className="order-line-price">
        {lineItem.price ? <Money data={lineItem.price} /> : null}
      </div>
    </li>
  );
}
