import {useEffect, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Link} from 'react-router';
import {Image, Money} from '@shopify/hydrogen';
import {BsBasket3} from 'react-icons/bs';
import {AddToCartButton} from '~/components/AddToCartButton';
import {useAddedToCart} from '~/components/AddedToCart';
import {useLocalizedHref} from '~/lib/localizedLink';
import {splitBrandTitle} from '~/lib/brand';
import {
  chartForTitle,
  convertedSize,
  hasConvertibleSizes,
  limitSizeValues,
} from '~/lib/sizes';
import {SizeUnitSwitcher, useSizeUnit} from '~/components/SizeUnitSwitcher';
import {useTranslate} from '~/lib/useTranslate';

/**
 * Quick add — buy the right variant straight from a product card.
 *
 * - Single-variant products: one tap adds to the basket.
 * - Multi-variant products (sizes / colors): opens a size picker rendered
 *   as a bottom sheet on mobile and a compact dialog on desktop, so
 *   shoppers never have to open the product page to buy.
 */

interface QuickAddMoney {
  amount: string;
  currencyCode: string;
}

interface QuickAddImage {
  id?: string | null;
  url: string;
  altText?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface QuickAddVariant {
  id: string;
  title: string;
  availableForSale: boolean;
  image?: QuickAddImage | null;
  selectedOptions: Array<{name: string; value: string}>;
  price: QuickAddMoney;
  compareAtPrice?: QuickAddMoney | null;
}

export interface QuickAddProductShape {
  id: string;
  handle: string;
  title: string;
  vendor?: string | null;
  featuredImage?: QuickAddImage | null;
  options?: Array<{name: string; optionValues: Array<{name: string}>}>;
  quickAddVariants?: {nodes: Array<QuickAddVariant>} | null;
  /** Set instead of `quickAddVariants` by loaders that pack their cards. */
  packedVariants?: PackedVariants | null;
}

// Moved to ~/lib/options so the product loader can use them server-side
// without importing this component. Re-exported because several components
// already import them from here.
export {displayOptionName, isSizeOption} from '~/lib/options';
import {displayOptionName, isSizeOption} from '~/lib/options';
import {cardVariants, type PackedVariants} from '~/lib/productCardFragment';

export function QuickAdd({product}: {product: QuickAddProductShape}) {
  const t = useTranslate();
  const localize = useLocalizedHref();
  const {show} = useAddedToCart();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Listing loaders send variants packed; this rebuilds the full objects.
  const variants = useMemo(
    () => cardVariants<QuickAddVariant>(product),
    [product],
  );
  const options = useMemo(
    () =>
      (product.options ?? [])
        // Same EU 36–47 rule as the product page. Applied here too, or a card
        // would offer a size the product page then refuses to show.
        .map((option) =>
          isSizeOption(option.name)
            ? {
                ...option,
                optionValues: limitSizeValues(
                  option.optionValues,
                  product.title,
                ),
              }
            : option,
        )
        .filter((option) => option.optionValues.length > 0),
    [product.options, product.title],
  );

  // Options the shopper actually has to choose from (more than one value).
  const choiceOptions = options.filter(
    (option) => option.optionValues.length > 1,
  );

  const productUrl = localize(`/products/${product.handle}`);

  // No variant data on this fragment — degrade to a plain product link.
  if (variants.length === 0) {
    return (
      <Link className="product-item-cta" prefetch="intent" to={productUrl}>
        View product
      </Link>
    );
  }

  const anyAvailable = variants.some((variant) => variant.availableForSale);

  // Single real variant — add it directly, no picker needed.
  if (variants.length === 1 || choiceOptions.length === 0) {
    const variant = variants[0];
    return (
      <AddToCartButton
        className="product-item-cta"
        disabled={!variant.availableForSale}
        lines={[{merchandiseId: variant.id, quantity: 1}]}
        onClick={() =>
          show({
            title: product.title,
            image: product.featuredImage,
            price: variant.price as never,
          })
        }
      >
        <BsBasket3 size={15} aria-hidden="true" />
        {t(variant.availableForSale ? 'Add to basket' : 'Sold out')}
      </AddToCartButton>
    );
  }

  const triggerLabel = choiceOptions.some((option) => isSizeOption(option.name))
    ? t('Choose size')
    : t('Choose options');

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="product-item-cta"
        disabled={!anyAvailable}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <BsBasket3 size={15} aria-hidden="true" />
        {anyAvailable ? triggerLabel : t('Sold out')}
      </button>
      {open ? (
        <QuickAddSheet
          product={product}
          variants={variants}
          choiceOptions={choiceOptions}
          options={options}
          onClose={() => {
            setOpen(false);
            triggerRef.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}

function QuickAddSheet({
  product,
  variants,
  options,
  choiceOptions,
  onClose,
}: {
  product: QuickAddProductShape;
  variants: QuickAddVariant[];
  options: NonNullable<QuickAddProductShape['options']>;
  choiceOptions: NonNullable<QuickAddProductShape['options']>;
  onClose: () => void;
}) {
  const t = useTranslate();
  const localize = useLocalizedHref();
  const {show} = useAddedToCart();
  const sizeUnit = useSizeUnit();
  // Brands step the EU scale differently, so the conversion has to know whose
  // shoe this is. Derived from the title: `vendor` is our own shop name on
  // every imported product.
  const sizeChart = chartForTitle(product.title);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Preselect options that only have one value; real choices start empty so
  // shoppers explicitly pick their size.
  const [selection, setSelection] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const option of options) {
      if (option.optionValues.length === 1) {
        initial[option.name] = option.optionValues[0].name;
      }
    }
    return initial;
  });

  // Lock page scroll while the sheet is open.
  useEffect(() => {
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, []);

  // Escape closes; focus moves into the dialog on open.
  useEffect(() => {
    dialogRef.current
      ?.querySelector<HTMLButtonElement>('.quick-add-close')
      ?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const matchedVariant = useMemo(() => {
    if (options.some((option) => !selection[option.name])) return undefined;
    return variants.find((variant) =>
      variant.selectedOptions.every(
        (selected) => selection[selected.name] === selected.value,
      ),
    );
  }, [variants, options, selection]);

  /**
   * Best variant for the CURRENT partial selection (e.g. color picked, size
   * not yet): no conflicts with chosen values, most options matched, image
   * preferred. Drives the live thumbnail + price before a full match.
   */
  const bestMatch = useMemo(() => {
    let best: QuickAddVariant | undefined;
    let bestScore = -1;
    for (const variant of variants) {
      let score = 0;
      let conflict = false;
      for (const selected of variant.selectedOptions) {
        const chosen = selection[selected.name];
        if (!chosen) continue;
        if (chosen === selected.value) {
          score++;
        } else {
          conflict = true;
          break;
        }
      }
      if (conflict) continue;
      const beats =
        score > bestScore ||
        (score === bestScore && Boolean(variant.image) && !best?.image);
      if (beats) {
        best = variant;
        bestScore = score;
      }
    }
    return best;
  }, [variants, selection]);

  const activeVariant = matchedVariant ?? bestMatch;
  const displayImage = activeVariant?.image ?? product.featuredImage;
  const {brand, rest: displayTitle} = splitBrandTitle(product.title);

  /**
   * A value pill is enabled when a variant exists for it that also matches
   * every OTHER currently selected option; it is marked available when at
   * least one of those variants is in stock.
   */
  function valueState(optionName: string, value: string) {
    const candidates = variants.filter((variant) =>
      variant.selectedOptions.every((selected) => {
        if (selected.name === optionName) return selected.value === value;
        const chosen = selection[selected.name];
        return !chosen || chosen === selected.value;
      }),
    );
    return {
      exists: candidates.length > 0,
      available: candidates.some((variant) => variant.availableForSale),
    };
  }

  const missingOptions = choiceOptions.filter(
    (option) => !selection[option.name],
  );
  const price = activeVariant?.price ?? variants[0]?.price;
  const compareAt = activeVariant?.compareAtPrice;
  const onSale =
    price &&
    compareAt &&
    parseFloat(compareAt.amount) > parseFloat(price.amount);

  const addLabel = matchedVariant
    ? matchedVariant.availableForSale
      ? 'Add to basket'
      : 'Sold out'
    : `Select ${missingOptions
        .map((option) => displayOptionName(option.name).toLowerCase())
        .join(' & ')}`;

  const sheet = (
    <div className="quick-add-overlay" role="presentation">
      <button
        type="button"
        className="quick-add-backdrop reset"
        aria-label={t('Close')}
        onClick={onClose}
        tabIndex={-1}
      />
      <div
        ref={dialogRef}
        className="quick-add-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Choose options for ${product.title}`}
      >
        <div className="quick-add-grabber" aria-hidden="true" />
        <div className="quick-add-head">
          {displayImage ? (
            <div className="quick-add-thumb">
              <Image
                key={displayImage.url}
                data={displayImage}
                alt={displayImage.altText || product.title}
                sizes="80px"
              />
            </div>
          ) : null}
          <div className="quick-add-head-info">
            {brand ? <span className="quick-add-brand">{brand}</span> : null}
            <span className="quick-add-title">{displayTitle}</span>
            {price ? (
              <span className={`quick-add-price${onSale ? ' on-sale' : ''}`}>
                <Money data={price as never} />
                {onSale && compareAt ? (
                  <s>
                    <Money data={compareAt as never} />
                  </s>
                ) : null}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="quick-add-close reset"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="quick-add-options">
          {choiceOptions.map((option) => {
            // Kids sneakers run their own grid (6Y, 5.5Y…) and now have charts
            // of their own, so they convert like anything else — the chart
            // `chartForTitle` hands back is already the kids one.
            const convertible =
              isSizeOption(option.name) &&
              hasConvertibleSizes(option.optionValues, sizeChart);
            return (
              <fieldset className="quick-add-option" key={option.name}>
                <legend>
                  {t(displayOptionName(option.name))}
                  {isSizeOption(option.name) ? (
                    <Link
                      className="quick-add-size-guide"
                      to={localize('/pages/size-guide')}
                      onClick={onClose}
                    >
                      {t('Size guide')}
                    </Link>
                  ) : null}
                </legend>
                {convertible ? (
                  <SizeUnitSwitcher kids={sizeChart.audience === 'kids'} />
                ) : null}
                <div
                  className={`quick-add-values${
                    isSizeOption(option.name) ? ' quick-add-values-sizes' : ''
                  }`}
                >
                  {option.optionValues.map((value) => {
                    const state = valueState(option.name, value.name);
                    const selected = selection[option.name] === value.name;
                    const alt = convertible
                      ? convertedSize(value.name, sizeUnit, sizeChart)
                      : null;
                    return (
                      <button
                        key={value.name}
                        type="button"
                        className={`quick-add-value${
                          selected ? ' is-selected' : ''
                        }${state.available ? '' : ' is-unavailable'}${
                          alt ? ' has-alt' : ''
                        }`}
                        disabled={!state.exists}
                        aria-pressed={selected}
                        aria-label={alt ? `${value.name} (${alt})` : undefined}
                        onClick={() =>
                          setSelection((current) => ({
                            ...current,
                            [option.name]: value.name,
                          }))
                        }
                      >
                        <span className="size-value-main">{value.name}</span>
                        {alt ? (
                          <span className="size-value-alt">{alt}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>

        <div className="quick-add-actions">
          <AddToCartButton
            className="btn btn-primary quick-add-submit"
            disabled={!matchedVariant || !matchedVariant.availableForSale}
            lines={
              matchedVariant
                ? [{merchandiseId: matchedVariant.id, quantity: 1}]
                : []
            }
            onClick={() => {
              if (!matchedVariant) return;
              show({
                title: product.title,
                image: matchedVariant.image ?? product.featuredImage,
                price: matchedVariant.price as never,
              });
              // Defer closing: unmounting the sheet (and its form)
              // synchronously here would cancel the pending submit event,
              // so the line would never reach the cart.
              setTimeout(onClose, 60);
            }}
          >
            {addLabel}
          </AddToCartButton>
          <Link
            className="quick-add-details"
            prefetch="intent"
            to={localize(`/products/${product.handle}`)}
            onClick={onClose}
          >
            {t('View full details')}
          </Link>
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
