import {Money} from '@shopify/hydrogen';
import {useEffect, useRef, useState} from 'react';
import {Link, useFetcher} from 'react-router';

import {AddToCartButton} from '~/components/AddToCartButton';
import type {CartRecProduct} from '~/routes/($locale).cart-recommendations';
import {useLocalePrefix, useLocalizedHref} from '~/lib/localizedLink';
import {useTranslate} from '~/lib/useTranslate';

/** How far one arrow press travels, as a share of the visible rail. */
const PAGE_FRACTION = 0.85;

/**
 * "Frequently bought together" inside the cart.
 *
 * Seeded from the FIRST line in the basket rather than the newest: the first
 * thing someone adds is usually the thing they came for, and the rest of the
 * basket tends to already be accessories to it.
 *
 * Fetched rather than loaded with the page, because the drawer opens
 * everywhere and nothing else on the page needs this data. It is requested
 * once per seed handle — reopening the drawer does not refetch.
 */
export function CartRecommendations({
  seedHandle,
  inCartHandles,
}: {
  seedHandle?: string;
  inCartHandles: string[];
}) {
  const t = useTranslate();
  const localize = useLocalizedHref();
  const prefix = useLocalePrefix();
  const fetcher = useFetcher<{products: CartRecProduct[]}>();
  const rail = useRef<HTMLDivElement>(null);
  const requested = useRef<string | null>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    if (!seedHandle || requested.current === seedHandle) return;
    requested.current = seedHandle;
    const params = new URLSearchParams({
      handle: seedHandle,
      exclude: inCartHandles.join(','),
    });
    void fetcher.load(`${prefix}/cart-recommendations?${params.toString()}`);
    // `fetcher` is deliberately out of the deps: it is a new object on every
    // render, and including it re-runs this on each one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedHandle, inCartHandles, prefix]);

  const syncArrows = () => {
    const node = rail.current;
    if (!node) return;
    setAtStart(node.scrollLeft <= 4);
    setAtEnd(node.scrollLeft + node.clientWidth >= node.scrollWidth - 4);
  };

  useEffect(syncArrows, [fetcher.data]);

  const page = (direction: 1 | -1) => {
    const node = rail.current;
    if (!node) return;
    node.scrollBy({
      left: direction * node.clientWidth * PAGE_FRACTION,
      behavior: 'smooth',
    });
  };

  // Anything already in the basket may have been added since the fetch.
  const products = (fetcher.data?.products ?? []).filter(
    (product) => !inCartHandles.includes(product.handle),
  );
  if (products.length === 0) return null;

  return (
    <section className="cart-recs" aria-labelledby="cart-recs-h">
      <div className="cart-recs-head">
        <h3 id="cart-recs-h">{t('Frequently bought together')}</h3>
        <div className="cart-recs-arrows">
          <button
            type="button"
            className="cart-recs-arrow"
            aria-label={t('Previous slide')}
            disabled={atStart}
            onClick={() => page(-1)}
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            type="button"
            className="cart-recs-arrow"
            aria-label={t('Next slide')}
            disabled={atEnd}
            onClick={() => page(1)}
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>
      </div>

      <div className="cart-recs-rail" ref={rail} onScroll={syncArrows}>
        {products.map((product) => {
          const variant = product.firstVariant;
          const price = variant?.price;
          const was = variant?.compareAtPrice;
          const onSale =
            was && price && Number(was.amount) > Number(price.amount);
          return (
            <article className="cart-rec" key={product.id}>
              <Link
                className="cart-rec-media"
                to={localize(`/products/${product.handle}`)}
                prefetch="intent"
              >
                {product.featuredImage?.url ? (
                  <img
                    src={product.featuredImage.url}
                    alt={product.featuredImage.altText ?? product.title}
                    loading="lazy"
                    width={product.featuredImage.width ?? undefined}
                    height={product.featuredImage.height ?? undefined}
                  />
                ) : null}
              </Link>
              <div className="cart-rec-body">
                <Link
                  className="cart-rec-title"
                  to={localize(`/products/${product.handle}`)}
                  prefetch="intent"
                >
                  {product.title}
                </Link>
                <p className="cart-rec-price">
                  {price ? (
                    <Money data={{...price, currencyCode: price.currencyCode as never}} />
                  ) : null}
                  {onSale && was ? (
                    <s>
                      <Money
                        data={{...was, currencyCode: was.currencyCode as never}}
                      />
                    </s>
                  ) : null}
                </p>
              </div>
              {variant?.id ? (
                <AddToCartButton
                  className="btn cart-rec-add"
                  lines={[{merchandiseId: variant.id, quantity: 1}]}
                >
                  {t('Add')}
                </AddToCartButton>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
