import {Money} from '@shopify/hydrogen';
import type {MoneyV2} from '@shopify/hydrogen/storefront-api-types';

import {klarnaPlanFor} from '~/lib/klarna';
import {useTranslate} from '~/lib/useTranslate';

/**
 * "Pay €49,99 in 3 installments or later with [Klarna.]" under the product
 * price. The wording follows what Klarna offers in the visitor's market (see
 * `~/lib/klarna`): three or four instalments, pay later only, or nothing.
 *
 * The amount sits inside a translated sentence, so the sentence is split on
 * its `{amount}` placeholder and the formatted price dropped in between.
 */
export function KlarnaLine({
  price,
  buyerCountry,
}: {
  price?: MoneyV2;
  buyerCountry?: string | null;
}) {
  const t = useTranslate();
  if (!price) return null;
  const total = Number(price.amount);
  const plan = klarnaPlanFor(total, price.currencyCode, buyerCountry);
  if (!plan) return null;

  let sentence: string;
  if (plan.kind === 'later') {
    sentence = t('Pay later with');
  } else if (plan.count === 4) {
    sentence = t('Pay {amount} in 4 installments with');
  } else if (plan.payLater) {
    sentence = t('Pay {amount} in 3 installments or later with');
  } else {
    sentence = t('Pay {amount} in 3 installments with');
  }

  const [before, after] = sentence.split('{amount}');
  const share: MoneyV2 | null =
    plan.kind === 'instalments'
      ? {
          amount: (Math.round((total / plan.count) * 100) / 100).toFixed(2),
          currencyCode: price.currencyCode,
        }
      : null;

  return (
    <p className="klarna-line">
      <span>
        {before}
        {share && after !== undefined ? (
          <>
            <strong>
              <Money data={share} as="span" />
            </strong>
            {after}
          </>
        ) : null}
      </span>{' '}
      <span className="klarna-line-badge">Klarna.</span>
    </p>
  );
}
