import {useEffect, useRef, useState} from 'react';
import {Link, useNavigate} from 'react-router';
import {type MappedProductOptions} from '@shopify/hydrogen';
import type {
  Maybe,
  ProductOptionValueSwatch,
} from '@shopify/hydrogen/storefront-api-types';
import {AddToCartButton} from './AddToCartButton';
import {useAddedToCart} from './AddedToCart';
import {displayOptionName, isSizeOption} from './QuickAdd';
import {useLocalizedHref} from '~/lib/localizedLink';
import {
  chartForTitle,
  convertedSize,
  hasConvertibleSizes,
  limitSizeValues,
} from '~/lib/sizes';
import type {SizeChart} from '~/lib/sizes';
import {SizeUnitSwitcher, useSizeUnit} from '~/components/SizeUnitSwitcher';
import {useTranslate} from '~/lib/useTranslate';
import type {ProductFragment} from 'storefrontapi.generated';

export function ProductForm({
  productOptions,
  productTitle,
  selectedVariant,
  favoriteSlot,
}: {
  productOptions: MappedProductOptions[];
  /** Only used to tell adult footwear from kids, for the EU 36–47 range. */
  productTitle: string;
  selectedVariant: ProductFragment['selectedOrFirstAvailableVariant'];
  /** Rendered beside the CTA (Zalando-style heart button). */
  favoriteSlot?: React.ReactNode;
}) {
  const t = useTranslate();
  const navigate = useNavigate();
  const {show} = useAddedToCart();
  const localize = useLocalizedHref();
  // Brands step the EU scale differently, so the conversion has to know whose
  // shoe this is. Derived from the title: `vendor` is our own shop name on
  // every imported product.
  const sizeChart = chartForTitle(productTitle);

  return (
    <div className="product-form">
      {productOptions.map((rawOption) => {
        // Adult sneakers offer EU 36–47; the feed ships every size the shoe
        // was made in. Kids products and apparel pass through untouched.
        const option = isSizeOption(rawOption.name)
          ? {
              ...rawOption,
              optionValues: limitSizeValues(
                rawOption.optionValues,
                productTitle,
                (value) => value.selected,
              ),
            }
          : rawOption;

        // If there is only a single value in the option values, don't display the option
        if (option.optionValues.length === 1) return null;

        // Zalando-style: sizes pick from a dropdown instead of pills. The
        // panel is our own (styled like the rest of the site), not the
        // browser's native select popup.
        if (isSizeOption(option.name)) {
          return (
            <SizeDropdown
              key={option.name}
              option={option}
              chart={sizeChart}
              convertible={hasConvertibleSizes(option.optionValues, sizeChart)}
              onPick={(value) => {
                if (value.selected) return;
                if (value.isDifferentProduct) {
                  void navigate(
                    localize(
                      `/products/${value.handle}?${value.variantUriQuery}`,
                    ),
                    {preventScrollReset: true},
                  );
                } else {
                  void navigate(`?${value.variantUriQuery}`, {
                    replace: true,
                    preventScrollReset: true,
                  });
                }
              }}
              sizeGuideHref={localize('/pages/size-guide')}
            />
          );
        }

        return (
          <div className="product-options" key={option.name}>
            <div className="product-options-head">
              <h5>{t(displayOptionName(option.name))}</h5>
            </div>
            <div className="product-options-grid">
              {option.optionValues.map((value) => {
                const {
                  name,
                  handle,
                  variantUriQuery,
                  selected,
                  available,
                  exists,
                  isDifferentProduct,
                  swatch,
                } = value;

                const optionClass = `product-options-item${
                  selected ? ' is-selected' : ''
                }${available ? '' : ' is-unavailable'}`;

                if (isDifferentProduct) {
                  // SEO
                  // When the variant is a combined listing child product
                  // that leads to a different url, we need to render it
                  // as an anchor tag
                  return (
                    <Link
                      className={optionClass}
                      key={option.name + name}
                      prefetch="intent"
                      preventScrollReset
                      replace
                      to={localize(`/products/${handle}?${variantUriQuery}`)}
                    >
                      <ProductOptionSwatch swatch={swatch} name={name} />
                    </Link>
                  );
                } else {
                  // SEO
                  // When the variant is an update to the search param,
                  // render it as a button with javascript navigating to
                  // the variant so that SEO bots do not index these as
                  // duplicated links
                  return (
                    <button
                      type="button"
                      className={optionClass}
                      key={option.name + name}
                      disabled={!exists}
                      onClick={() => {
                        if (!selected) {
                          void navigate(`?${variantUriQuery}`, {
                            replace: true,
                            preventScrollReset: true,
                          });
                        }
                      }}
                    >
                      <ProductOptionSwatch swatch={swatch} name={name} />
                    </button>
                  );
                }
              })}
            </div>
          </div>
        );
      })}
      {/* One big pill + round heart, like the reference. Quantity is
          adjusted in the cart, so the row stays clean. */}
      <div className="product-buy-row">
        <AddToCartButton
          className="btn btn-primary product-add-btn"
          disabled={!selectedVariant || !selectedVariant.availableForSale}
          onClick={() => {
            if (!selectedVariant) return;
            show({
              title: selectedVariant.product?.title ?? '',
              image: selectedVariant.image,
              price: selectedVariant.price,
            });
          }}
          lines={
            selectedVariant
              ? [
                  {
                    merchandiseId: selectedVariant.id,
                    quantity: 1,
                    selectedVariant,
                  },
                ]
              : []
          }
        >
          {t(selectedVariant?.availableForSale ? 'Add to cart' : 'Sold out')}
        </AddToCartButton>
        {favoriteSlot ? (
          <div className="product-buy-fav">{favoriteSlot}</div>
        ) : null}
      </div>
    </div>
  );
}

type SizeOptionValue = MappedProductOptions['optionValues'][number];

/**
 * Custom size dropdown: the trigger looks like the Zalando "Choose size"
 * box, and the open panel is a site-styled card (rounded, shadowed, hover
 * rows) instead of the browser's native select popup. Sold-out sizes stay
 * visible but disabled.
 */
function SizeDropdown({
  option,
  onPick,
  sizeGuideHref,
  convertible,
  chart,
}: {
  option: MappedProductOptions;
  onPick: (value: SizeOptionValue) => void;
  sizeGuideHref: string;
  /** False for apparel, which has no EU conversion to offer. */
  convertible: boolean;
  /** The brand's own EU grid — see chartForTitle. */
  chart: SizeChart;
}) {
  const t = useTranslate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sizeUnit = useSizeUnit();
  const selected = option.optionValues.find((value) => value.selected);
  const altFor = (name: string) =>
    convertible ? convertedSize(name, sizeUnit, chart) : null;

  // Close when clicking anywhere outside, or with Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="product-options" ref={wrapRef}>
      <div className="product-options-head">
        <h5>{t(displayOptionName(option.name))}</h5>
        <Link
          className="product-options-size-guide"
          to={sizeGuideHref}
          prefetch="intent"
        >
          {t('Size guide')}
        </Link>
      </div>
      {convertible ? (
        <SizeUnitSwitcher kids={chart.audience === 'kids'} />
      ) : null}
      <div className="size-dd">
        <button
          type="button"
          className={`size-dd-trigger${open ? ' is-open' : ''}${
            selected ? '' : ' is-placeholder'
          }`}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span>
            {selected ? selected.name : t('Choose size')}
            {selected && altFor(selected.name) ? (
              <em className="size-dd-alt"> · {altFor(selected.name)}</em>
            ) : null}
            {selected && !selected.available ? (
              <em className="size-dd-soldout"> — sold out</em>
            ) : null}
          </span>
          <svg
            className={`size-dd-caret${open ? ' is-open' : ''}`}
            viewBox="0 0 24 24"
            width="22"
            height="22"
            aria-hidden="true"
          >
            <path
              d="m5 9 7 7 7-7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        {open ? (
          <div className="size-dd-panel" role="listbox" aria-label={t('Sizes')}>
            {option.optionValues.map((value) => (
              <button
                key={value.name}
                type="button"
                role="option"
                aria-selected={value.selected}
                disabled={!value.exists}
                className={`size-dd-row${
                  value.selected ? ' is-selected' : ''
                }${value.available ? '' : ' is-unavailable'}`}
                onClick={() => {
                  setOpen(false);
                  onPick(value);
                }}
              >
                <span className="size-dd-check" aria-hidden="true">
                  {value.selected ? '✓' : ''}
                </span>
                <span className="size-dd-label">{value.name}</span>
                {altFor(value.name) ? (
                  <span className="size-dd-alt">{altFor(value.name)}</span>
                ) : null}
                {!value.available ? (
                  <span className="size-dd-note">{t('Sold out')}</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ProductOptionSwatch({
  swatch,
  name,
}: {
  swatch?: Maybe<ProductOptionValueSwatch> | undefined;
  name: string;
}) {
  const image = swatch?.image?.previewImage?.url;
  const color = swatch?.color;

  if (!image && !color) return name;

  return (
    <div
      role="img"
      aria-label={name}
      className="product-option-label-swatch"
      style={{
        backgroundColor: color || 'transparent',
      }}
    >
      {!!image && <img src={image} alt={name} />}
    </div>
  );
}
