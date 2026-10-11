import type {CartLineUpdateInput} from '@shopify/hydrogen/storefront-api-types';
import type {CartLayout, LineItemChildrenMap} from '~/components/CartMain';
import {
  CartForm,
  Image,
  Money,
  type OptimisticCartLine,
} from '@shopify/hydrogen';
import {useVariantUrl} from '~/lib/variants';
import {Link} from 'react-router';
import {useAside} from './Aside';
import {useLocalePrefix} from '~/lib/localizedLink';
import {splitBrandTitle} from '~/lib/brand';
import {displayOptionName} from '~/components/QuickAdd';
import type {CartApiQueryFragment} from 'storefrontapi.generated';

export type CartLine = OptimisticCartLine<CartApiQueryFragment>;

/**
 * Normalize the many imported option names (Maat, Mate, Schoenmaat,
 * Title…) to what shoppers actually understand: Size / Color.
 */
function optionLabel(name: string) {
  return displayOptionName(name);
}

/**
 * A single line item in the cart. It displays the product image, title, price.
 * It also provides controls to update the quantity or remove the line item.
 * If the line is a parent line that has child components (like warranties or gift wrapping), they are
 * rendered nested below the parent line.
 */
export function CartLineItem({
  layout,
  line,
  childrenMap,
}: {
  layout: CartLayout;
  line: CartLine;
  childrenMap: LineItemChildrenMap;
}) {
  const {id, merchandise, quantity, isOptimistic} = line;
  const {product, image, selectedOptions} = merchandise;
  const lineItemUrl = useVariantUrl(product.handle, selectedOptions);
  const {close} = useAside();
  const lineItemChildren = childrenMap[id];
  const childrenLabelId = `cart-line-children-${id}`;
  const {brand, rest} = splitBrandTitle(product.title);

  const handleLinkClick = () => {
    if (layout === 'aside') close();
  };

  // Two reasons a line can be cheaper, in priority order:
  //  1. An automatic discount (buy 2 → 10% off the 3rd): line total drops
  //     below the line subtotal. Show the discounted price, the struck
  //     original and a -X% chip so the deal is visible IN the cart.
  //  2. A compare-at sale price: same treatment based on compare-at.
  const unitPrice = line.cost?.amountPerQuantity;
  const unitCompare = line.cost?.compareAtAmountPerQuantity;
  const lineSubtotal =
    line.cost && 'subtotalAmount' in line.cost
      ? (
          line.cost as {
            subtotalAmount?: NonNullable<
              CartLine['cost']
            >['totalAmount'];
          }
        ).subtotalAmount
      : undefined;

  const serverTotal = line.cost?.totalAmount;
  const discounted = Boolean(
    serverTotal &&
      lineSubtotal &&
      parseFloat(serverTotal.amount) <
        parseFloat(lineSubtotal.amount) - 0.001,
  );

  // Quantity updates are optimistic but cost amounts lag one round-trip —
  // unit × quantity stays consistent in that window, so prefer it unless a
  // line-level discount makes the server total the only truthful figure.
  const total =
    !discounted && unitPrice?.amount && typeof quantity === 'number'
      ? {
          amount: (parseFloat(unitPrice.amount) * quantity).toFixed(2),
          currencyCode: unitPrice.currencyCode,
        }
      : serverTotal;

  const onSale =
    discounted ||
    Boolean(
      unitPrice &&
        unitCompare &&
        parseFloat(unitCompare.amount) > parseFloat(unitPrice.amount),
    );

  const compareTotal = discounted
    ? (lineSubtotal ?? null)
    : onSale && unitCompare && typeof quantity === 'number'
      ? {
          amount: (parseFloat(unitCompare.amount) * quantity).toFixed(2),
          currencyCode: unitCompare.currencyCode,
        }
      : null;

  const discountPct =
    total && compareTotal
      ? Math.round(
          (1 -
            parseFloat(total.amount) / parseFloat(compareTotal.amount)) *
            100,
        )
      : 0;

  return (
    <li key={id} className="cart-line">
      <div className="cart-line-inner">
        {image && (
          <Link
            className="cart-line-media"
            prefetch="intent"
            to={lineItemUrl}
            onClick={handleLinkClick}
            tabIndex={-1}
            aria-hidden="true"
          >
            <Image
              alt={image.altText || product.title}
              data={image}
              height={76}
              loading="lazy"
              width={76}
            />
          </Link>
        )}

        <div className="cart-line-body">
          <div className="cart-line-head">
            <Link
              className="cart-line-titles"
              prefetch="intent"
              to={lineItemUrl}
              onClick={handleLinkClick}
            >
              {brand ? <span className="cart-line-brand">{brand}</span> : null}
              <span className="cart-line-title">{rest}</span>
            </Link>
            <CartLineRemoveButton lineIds={[id]} disabled={!!isOptimistic} />
          </div>

          {total ? (
            <div className={`cart-line-price${onSale ? ' on-sale' : ''}`}>
              <Money data={total} />
              {compareTotal ? (
                <s>
                  <Money data={compareTotal} />
                </s>
              ) : null}
              {onSale && discountPct > 0 ? (
                <span
                  className={`cart-line-pct${discounted ? ' is-deal' : ''}`}
                >
                  -{discountPct}%
                </span>
              ) : null}
            </div>
          ) : null}

          <ul className="cart-line-options">
            {selectedOptions
              .filter((option) => option.value !== 'Default Title')
              .map((option) => (
                <li key={option.name}>
                  {optionLabel(option.name)}: {option.value}
                </li>
              ))}
          </ul>

          <CartLineQuantity line={line} />
        </div>
      </div>

      {lineItemChildren ? (
        <div>
          <p id={childrenLabelId} className="sr-only">
            Line items with {product.title}
          </p>
          <ul aria-labelledby={childrenLabelId} className="cart-line-children">
            {lineItemChildren.map((childLine) => (
              <CartLineItem
                childrenMap={childrenMap}
                key={childLine.id}
                line={childLine}
                layout={layout}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

/**
 * Provides the controls to update the quantity of a line item in the cart.
 * These controls are disabled when the line item is new, and the server
 * hasn't yet responded that it was successfully added to the cart.
 */
function CartLineQuantity({line}: {line: CartLine}) {
  if (!line || typeof line?.quantity === 'undefined') return null;
  const {id: lineId, quantity, isOptimistic} = line;
  const prevQuantity = Number(Math.max(0, quantity - 1).toFixed(0));
  const nextQuantity = Number((quantity + 1).toFixed(0));

  return (
    <div className="cart-line-controls">
      <div
        className="cart-line-qty"
        role="group"
        aria-label={`Quantity: ${quantity}`}
      >
        <CartLineUpdateButton lines={[{id: lineId, quantity: prevQuantity}]}>
          <button
            aria-label="Decrease quantity"
            disabled={quantity <= 1 || !!isOptimistic}
            name="decrease-quantity"
            value={prevQuantity}
          >
            &#8722;
          </button>
        </CartLineUpdateButton>
        <span className="cart-line-qty-value">{quantity}</span>
        <CartLineUpdateButton lines={[{id: lineId, quantity: nextQuantity}]}>
          <button
            aria-label="Increase quantity"
            name="increase-quantity"
            value={nextQuantity}
            disabled={!!isOptimistic}
          >
            &#43;
          </button>
        </CartLineUpdateButton>
      </div>
    </div>
  );
}

/**
 * A slim ✕ that removes a line item from the cart, sitting at the top right
 * of the line like the big fashion shops. Disabled while the line is still
 * being added.
 */
function CartLineRemoveButton({
  lineIds,
  disabled,
}: {
  lineIds: string[];
  disabled: boolean;
}) {
  const cartRoute = useLocalePrefix() + '/cart';
  return (
    <CartForm
      fetcherKey={getUpdateKey(lineIds)}
      route={cartRoute}
      action={CartForm.ACTIONS.LinesRemove}
      inputs={{lineIds}}
    >
      <button
        className="cart-line-remove"
        disabled={disabled}
        type="submit"
        aria-label="Remove item"
        title="Remove item"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          {/* Lid, handle, tapered can, two tines. Drawn on a 24 grid with
              the can narrower than the lid — an untapered box reads as a
              crate, which is what made the first attempt look wrong. */}
          <path
            d="M3.8 6.6h16.4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M9.6 6.6V5.3a1.6 1.6 0 0 1 1.6-1.6h1.6a1.6 1.6 0 0 1 1.6 1.6v1.3"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M6.3 6.6h11.4l-.85 12.1a2.1 2.1 0 0 1-2.1 2H9.25a2.1 2.1 0 0 1-2.1-2L6.3 6.6Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M10.2 10.4v6.3M13.8 10.4v6.3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </CartForm>
  );
}

function CartLineUpdateButton({
  children,
  lines,
}: {
  children: React.ReactNode;
  lines: CartLineUpdateInput[];
}) {
  const lineIds = lines.map((line) => line.id);
  const cartRoute = useLocalePrefix() + '/cart';

  return (
    <CartForm
      fetcherKey={getUpdateKey(lineIds)}
      route={cartRoute}
      action={CartForm.ACTIONS.LinesUpdate}
      inputs={{lines}}
    >
      {children}
    </CartForm>
  );
}

/**
 * Returns a unique key for the update action. This is used to make sure actions modifying the same line
 * items are not run concurrently, but cancel each other. For example, if the user clicks "Increase quantity"
 * and "Decrease quantity" in rapid succession, the actions will cancel each other and only the last one will run.
 * @param lineIds - line ids affected by the update
 * @returns
 */
function getUpdateKey(lineIds: string[]) {
  return [CartForm.ACTIONS.LinesUpdate, ...lineIds].join('-');
}
