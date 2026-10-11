import {Money} from '@shopify/hydrogen';
import type {MoneyV2} from '@shopify/hydrogen/storefront-api-types';
import {useTranslate} from '~/lib/useTranslate';

/**
 * Zalando-style price block:
 * - regular:  **€ 139,99**  incl. VAT
 * - on sale:  **€ 135,95** (red)  incl. VAT
 *             Original: ~~€ 181,98~~  -25%
 */
export function ProductPrice({
  price,
  compareAtPrice,
}: {
  price?: MoneyV2;
  compareAtPrice?: MoneyV2 | null;
}) {
  const t = useTranslate();
  const priceAmount = Number(price?.amount ?? 0);
  const compareAmount = Number(compareAtPrice?.amount ?? 0);
  const onSale = priceAmount > 0 && compareAmount > priceAmount;
  const discountPercent = onSale
    ? Math.round((1 - priceAmount / compareAmount) * 100)
    : 0;

  return (
    <div aria-label="Price" className="product-price" role="group">
      <div className={`product-price-main${onSale ? ' is-sale' : ''}`}>
        {price ? <Money data={price} /> : <span>&nbsp;</span>}
        <span className="product-vat-note">{t('incl. VAT')}</span>
      </div>
      {onSale && compareAtPrice ? (
        <div className="product-price-original">
          {t('Original:')}{' '}
          <s>
            <Money data={compareAtPrice} />
          </s>
          {discountPercent > 0 ? (
            <em className="product-price-discount">-{discountPercent}%</em>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
