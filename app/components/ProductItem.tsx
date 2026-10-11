import {useMemo, useRef, useState} from 'react';
import {Link, useLocation} from 'react-router';
import {Image, Money} from '@shopify/hydrogen';
import type {ProductCardFragment} from 'storefrontapi.generated';
import {useVariantUrl} from '~/lib/variants';
import {useLocalizedHref} from '~/lib/localizedLink';
import {FavoriteButton} from '~/components/FavoriteButton';
import {
  QuickAdd,
  displayOptionName,
  type QuickAddProductShape,
} from '~/components/QuickAdd';
import {cardVendor, splitBrandTitle} from '~/lib/brand';
import {cardVariants, type AnyProductCard} from '~/lib/productCardFragment';
import {useTranslate} from '~/lib/useTranslate';

export function ProductItem({
  product,
  loading,
  badge,
}: {
  product: AnyProductCard;
  loading?: 'eager' | 'lazy';
  /**
   * Overrides the label on the bestseller badge. The badge itself is NOT
   * controlled from here — see `isBestseller` below.
   */
  badge?: string;
}) {
  const t = useTranslate();
  /*
   * Bestseller status belongs to the product, not to the rail.
   *
   * This used to be driven purely by the `badge` prop, which only two places
   * passed — so the same Travis Scott Low was badged in "Bestsellers" and
   * bare in "Trending sneakers" half a screen below. Reading the catalogue's
   * own `bestseller` tag makes it one answer everywhere: rails, collection
   * grids, search, favourites.
   */
  const isBestseller = (product.tags ?? []).includes('bestseller');
  // Curated via scripts/tag-bestsellers.mjs, not sales data — so it is
  // labelled "Staff pick", which is what it is (no unverifiable claims).
  const badgeLabel = badge ?? t('Staff pick');
  const variantUrl = useVariantUrl(product.handle);
  const localize = useLocalizedHref();
  const location = useLocation();
  // Remember exactly where the shopper was (page, filters, scroll context)
  // so the product page's back link can return to this precise spot.
  const cameFrom = location.pathname + location.search;

  // Flip through a product's shots in place, the way the big shops do, so
  // browsing a grid doesn't mean bouncing in and out of product pages.
  const gallery = useMemo(() => {
    const extra = 'images' in product ? (product.images?.nodes ?? []) : [];
    const seen = new Set<string>();
    return [product.featuredImage, ...extra]
      .filter((shot): shot is NonNullable<typeof shot> => Boolean(shot?.url))
      .filter((shot) => {
        if (seen.has(shot.url)) return false;
        seen.add(shot.url);
        return true;
      })
      .slice(0, 5);
  }, [product]);
  const [imageIndex, setImageIndex] = useState(0);
  // Hovering a colourway thumb previews that colour in the card's main
  // image; leaving the thumb restores the regular shot.
  const [previewImage, setPreviewImage] = useState<
    NonNullable<ProductCardFragment['featuredImage']> | null
  >(null);

  /** Arrows live inside the card's <Link>, so suppress the navigation. */
  const step = (event: React.MouseEvent, delta: number) => {
    event.preventDefault();
    event.stopPropagation();
    setImageIndex(
      (current) => (current + delta + gallery.length) % gallery.length,
    );
  };

  // Touch: swipe the tile to flip shots. A real swipe never fires the
  // link's click (browsers cancel it once the finger moves), so navigation
  // stays on tap only. Vertical scrolling is untouched — we only act on a
  // clearly horizontal gesture.
  const touchStart = useRef<{x: number; y: number} | null>(null);
  const onTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    touchStart.current = {x: touch.clientX, y: touch.clientY};
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || gallery.length < 2) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      setImageIndex(
        (current) =>
          (current + (dx < 0 ? 1 : -1) + gallery.length) % gallery.length,
      );
    }
  };
  // Colourway thumbnails (Zalando-style): when the product has a colour
  // option with several values, hovering the card reveals one small image
  // per colour, linking straight to that colourway.
  const colorThumbs = useMemo(() => {
    const options = 'options' in product ? (product.options ?? []) : [];
    const colorOption = options.find(
      (option) =>
        displayOptionName(option.name) === 'Color' &&
        option.optionValues.length > 1,
    );
    if (!colorOption) return null;
    const variants = cardVariants(product);
    const thumbs = colorOption.optionValues
      .map((value) => {
        const matching = variants.filter((candidate) =>
          candidate.selectedOptions?.some(
            (selected) =>
              selected.name === colorOption.name &&
              selected.value === value.name,
          ),
        );
        const variant =
          matching.find((candidate) => candidate.availableForSale) ??
          matching[0];
        if (!variant?.image?.url) return null;
        // Link with the variant's FULL option set — a colour alone doesn't
        // uniquely identify a variant, so Shopify would fall back to the
        // first available one (wrong colour).
        const query = new URLSearchParams(
          (variant.selectedOptions ?? []).map((selected) => [
            selected.name,
            selected.value,
          ]),
        ).toString();
        return {value: value.name, image: variant.image, query};
      })
      .filter((thumb): thumb is NonNullable<typeof thumb> => thumb !== null);
    return thumbs.length > 1 ? {thumbs} : null;
  }, [product]);

  const split = splitBrandTitle(product.title);
  // Prefer a real third-party vendor; otherwise derive the brand from the
  // title (vendor data still holds the legacy import placeholder).
  const vendor =
    cardVendor('vendor' in product ? product.vendor : undefined) ??
    split.brand;
  const displayTitle = split.brand ? split.rest : product.title;
  const firstVariant =
    'firstVariant' in product ? product.firstVariant : undefined;

  // Show the product's lowest variant price — the same figure Shopify sorts
  // a collection by, so the grid can never look out of order. Sizes often
  // differ in price, hence the "From" prefix (Zalando's "Vanaf €…").
  const price = product.priceRange.minVariantPrice;
  const compareAt =
    'compareAtPriceRange' in product
      ? product.compareAtPriceRange?.minVariantPrice
      : firstVariant?.compareAtPrice;
  const priceAmount = Number(price?.amount ?? 0);
  const compareAmount = Number(compareAt?.amount ?? 0);
  const isRange =
    Number(product.priceRange.maxVariantPrice?.amount ?? 0) > priceAmount;
  const onSale = priceAmount > 0 && compareAmount > priceAmount;
  const discountPercent = onSale
    ? Math.round((1 - priceAmount / compareAmount) * 100)
    : 0;

  return (
    <div className="product-item-wrapper">
      <Link
        className="product-item"
        key={product.id}
        prefetch="intent"
        to={localize(variantUrl)}
        state={{from: cameFrom}}
      >
        <div
          className="product-item-media"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {isBestseller ? (
            <span className="product-item-badge is-bestseller">
              {/* Empty alt, not a description: screen readers should hear
                  "Bestseller" once, from the text below, rather than twice. */}
              <img
                className="product-item-badge-mark"
                src="/icons/bestseller.png"
                alt=""
                width={34}
                height={34}
                loading="lazy"
                draggable={false}
              />
              <span className="product-item-badge-text">{badgeLabel}</span>
            </span>
          ) : onSale ? (
            <span className="product-item-badge">Deal</span>
          ) : null}
          {gallery.length > 0 ? (
            <>
              <Image
                key={(previewImage ?? gallery[imageIndex]).id ?? imageIndex}
                alt={
                  (previewImage ?? gallery[imageIndex]).altText ||
                  product.title
                }
                data={previewImage ?? gallery[imageIndex]}
                loading={loading}
                sizes="(min-width: 60em) 460px, 50vw"
              />
              {gallery.length > 1 ? (
                <>
                  <button
                    type="button"
                    className="product-item-arrow is-prev"
                    aria-label="Previous image"
                    onClick={(event) => step(event, -1)}
                  >
                    <ArrowIcon direction="left" />
                  </button>
                  <button
                    type="button"
                    className="product-item-arrow is-next"
                    aria-label="Next image"
                    onClick={(event) => step(event, 1)}
                  >
                    <ArrowIcon direction="right" />
                  </button>
                  <span className="product-item-dots" aria-hidden="true">
                    {gallery.map((shot, index) => (
                      <span
                        key={shot.id ?? index}
                        className={index === imageIndex ? 'is-on' : undefined}
                      />
                    ))}
                  </span>
                </>
              ) : null}
            </>
          ) : (
            <div className="product-item-media-fallback" aria-hidden="true">
              <img src="/fastsneakers-logo.png" alt="" loading="lazy" />
              <span>Image coming soon</span>
            </div>
          )}
        </div>
        <div className="product-item-info">
          {vendor ? (
            <span className="product-item-vendor">{vendor}</span>
          ) : null}
          <h3 className="product-item-title">{displayTitle}</h3>
          <span className={`product-item-price${onSale ? ' on-sale' : ''}`}>
            {isRange ? <span className="product-item-from">From</span> : null}
            <Money data={price} />
            {onSale && compareAt ? (
              <>
                <s className="product-item-compare">
                  <Money data={compareAt} />
                </s>
                {discountPercent > 0 ? (
                  <span className="product-item-pct">-{discountPercent}%</span>
                ) : null}
              </>
            ) : null}
          </span>
        </div>
      </Link>
      {colorThumbs ? (
        <nav className="product-item-colors" aria-label="Other colours">
          <div className="product-item-colors-row">
            {colorThumbs.thumbs.map((thumb, index) => {
            const shownUrl = (previewImage ?? gallery[imageIndex])?.url;
            const matched = colorThumbs.thumbs.some(
              (candidate) => candidate.image.url === shownUrl,
            );
            const isCurrent = matched
              ? thumb.image.url === shownUrl
              : index === 0;
            return (
              <Link
                key={thumb.value}
                className={`product-item-color${isCurrent ? ' is-current' : ''}`}
                to={localize(`/products/${product.handle}?${thumb.query}`)}
                state={{from: cameFrom}}
                aria-label={thumb.value}
                title={thumb.value}
                onMouseEnter={() => setPreviewImage(thumb.image)}
                onMouseLeave={() => setPreviewImage(null)}
                onFocus={() => setPreviewImage(thumb.image)}
                onBlur={() => setPreviewImage(null)}
              >
                  <Image
                    data={thumb.image}
                    alt={thumb.value}
                    aspectRatio="1/1"
                    sizes="48px"
                    loading="lazy"
                  />
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
      <div className="product-item-actions">
        <QuickAdd product={product as QuickAddProductShape} />
      </div>
      <FavoriteButton productId={product.id} title={product.title} />
    </div>
  );
}

function ArrowIcon({direction}: {direction: 'left' | 'right'}) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
