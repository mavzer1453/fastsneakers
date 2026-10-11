import {
  Link,
  useLoaderData,
  useNavigation,
  useSearchParams,
} from 'react-router';
import type {Route} from './+types/($locale).account.orders._index';
import {useRef} from 'react';
import {
  Money,
  getPaginationVariables,
  flattenConnection,
} from '@shopify/hydrogen';
import {
  buildOrderSearchQuery,
  parseOrderFilters,
  ORDER_FILTER_FIELDS,
  type OrderFilterParams,
} from '~/lib/orderFilters';
import {CUSTOMER_ORDERS_QUERY} from '~/graphql/customer-account/CustomerOrdersQuery';
import type {
  CustomerOrdersFragment,
  OrderItemFragment,
} from 'customer-accountapi.generated';
import {PaginatedResourceSection} from '~/components/PaginatedResourceSection';
import {useLocalizedHref} from '~/lib/localizedLink';
import {useTranslate} from '~/lib/useTranslate';

type OrdersLoaderData = {
  customer: CustomerOrdersFragment;
  filters: OrderFilterParams;
};

export const meta: Route.MetaFunction = () => {
  return [{title: 'Orders'}];
};

export async function loader({request, context}: Route.LoaderArgs) {
  const {customerAccount} = context;
  const paginationVariables = getPaginationVariables(request, {
    pageBy: 20,
  });

  const url = new URL(request.url);
  const filters = parseOrderFilters(url.searchParams);
  const query = buildOrderSearchQuery(filters);

  const {data, errors} = await customerAccount.query(CUSTOMER_ORDERS_QUERY, {
    variables: {
      ...paginationVariables,
      query,
      language: customerAccount.i18n.language,
    },
  });

  if (errors?.length || !data?.customer) {
    throw Error('Customer orders not found');
  }

  return {customer: data.customer, filters};
}

export default function Orders() {
  const {customer, filters} = useLoaderData<OrdersLoaderData>();
  const {orders} = customer;

  return (
    <div className="orders">
      <OrderSearchForm currentFilters={filters} />
      <OrdersTable orders={orders} filters={filters} />
    </div>
  );
}

function OrdersTable({
  orders,
  filters,
}: {
  orders: CustomerOrdersFragment['orders'];
  filters: OrderFilterParams;
}) {
  const hasFilters = !!(filters.name || filters.confirmationNumber);

  return (
    <div className="orders-list" aria-live="polite">
      {orders?.nodes.length ? (
        // The grid class has to go here, not on .orders-list: the pagination
        // component renders its own wrapper around the cards, so a grid on
        // the outer element only ever had one child to lay out — which is
        // why the cards stacked full-width instead of pairing up.
        <PaginatedResourceSection
          connection={orders}
          resourcesClassName="orders-grid"
        >
          {({node: order}) => <OrderItem key={order.id} order={order} />}
        </PaginatedResourceSection>
      ) : (
        <EmptyOrders hasFilters={hasFilters} />
      )}
    </div>
  );
}

function EmptyOrders({hasFilters = false}: {hasFilters?: boolean}) {
  const localize = useLocalizedHref();
  const t = useTranslate();
  return (
    <div className="orders-empty">
      {hasFilters ? (
        <>
          <div className="orders-empty-icon" aria-hidden="true">
            🔍
          </div>
          <h3>{t('No matching orders')}</h3>
          <p>{t('We couldn’t find any orders for that search.')}</p>
          <Link className="btn btn-ghost" to={localize('/account/orders')}>
            {t('Clear filters')}
          </Link>
        </>
      ) : (
        <>
          <div className="orders-empty-icon" aria-hidden="true">
            📦
          </div>
          <h3>{t('No orders yet')}</h3>
          <p>{t('When you place your first order, it’ll appear here.')}</p>
          <Link className="btn btn-primary" to={localize('/collections')}>
            {t('Start shopping')}
          </Link>
        </>
      )}
    </div>
  );
}

function OrderSearchForm({
  currentFilters,
}: {
  currentFilters: OrderFilterParams;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  const isSearching =
    navigation.state !== 'idle' &&
    navigation.location?.pathname?.includes('orders');
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams();

    const name = formData.get(ORDER_FILTER_FIELDS.NAME)?.toString().trim();
    const confirmationNumber = formData
      .get(ORDER_FILTER_FIELDS.CONFIRMATION_NUMBER)
      ?.toString()
      .trim();

    if (name) params.set(ORDER_FILTER_FIELDS.NAME, name);
    if (confirmationNumber)
      params.set(ORDER_FILTER_FIELDS.CONFIRMATION_NUMBER, confirmationNumber);

    setSearchParams(params);
  };

  const hasFilters = currentFilters.name || currentFilters.confirmationNumber;
  const t = useTranslate();

  return (
    // Collapsed by default: most people have a handful of orders and can see
    // them all, so a permanently open two-field form was the loudest thing on
    // the page for the rarest job. Stays open when a filter is applied.
    <details className="order-search" open={Boolean(hasFilters)}>
      <summary className="order-search-summary">
        <span>{t('Find an order')}</span>
        <span className="menu-chevron" aria-hidden="true">
          ›
        </span>
      </summary>
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="order-search-form"
        aria-label="Search orders"
      >
        <div className="order-search-inputs">
          <label className="order-search-field">
            <span>{t('Order number')}</span>
            <input
              type="search"
              name={ORDER_FILTER_FIELDS.NAME}
              placeholder="#1024"
              defaultValue={currentFilters.name || ''}
            />
          </label>
          <label className="order-search-field">
            <span>{t('Confirmation number')}</span>
            <input
              type="search"
              name={ORDER_FILTER_FIELDS.CONFIRMATION_NUMBER}
              placeholder="RG13JQ1I8"
              defaultValue={currentFilters.confirmationNumber || ''}
            />
          </label>
        </div>

        <div className="order-search-buttons">
          <button
            type="submit"
            className="btn btn-dark"
            disabled={isSearching}
          >
            {isSearching ? t('Searching…') : t('Search')}
          </button>
          {hasFilters ? (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={isSearching}
              onClick={() => {
                setSearchParams(new URLSearchParams());
                formRef.current?.reset();
              }}
            >
              {t('Clear')}
            </button>
          ) : null}
        </div>
      </form>
    </details>
  );
}

function OrderItem({order}: {order: OrderItemFragment}) {
  const localize = useLocalizedHref();
  const t = useTranslate();
  const fulfillmentStatus = flattenConnection(order.fulfillments)[0]?.status;
  const orderUrl = localize(`/account/orders/${btoa(order.id)}`);
  const financial = order.financialStatus ?? '';
  const placed = new Date(order.processedAt);
  return (
    <article className="order-card">
      <div className="order-card-head">
        <div className="order-card-ident">
          <Link to={orderUrl} className="order-card-number">
            {t('Order #')}
            {order.number}
          </Link>
          <time className="order-card-date" dateTime={order.processedAt}>
            {placed.toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </time>
        </div>
        <span className="order-card-total">
          <Money data={order.totalPrice} />
        </span>
      </div>

      <div className="order-card-meta">
        <span className={`order-badge order-badge-${financial.toLowerCase()}`}>
          {financial || t('Pending')}
        </span>
        {fulfillmentStatus ? (
          <span className="order-badge order-badge-muted">
            {fulfillmentStatus}
          </span>
        ) : null}
      </div>

      {order.confirmationNumber ? (
        <p className="order-card-conf">
          {t('Confirmation')} <span>{order.confirmationNumber}</span>
        </p>
      ) : null}

      <Link to={orderUrl} className="btn btn-dark order-card-cta">
        {t('View order')}
      </Link>
    </article>
  );
}
