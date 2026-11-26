import {useEffect, useState} from 'react';
import {Link} from 'react-router';
import {BLACK_FRIDAY, useBlackFridayCountdown} from '~/lib/promo';
import {useLocalizedHref} from '~/lib/localizedLink';
import {useTranslate} from '~/lib/useTranslate';

/**
 * Black Friday countdown bar (MERA-style), shown on the homepage in place of
 * the offer band while BLACK_FRIDAY is live.
 *
 * The homepage loader decides whether this renders at all, so after the end
 * date the server simply goes back to <PromoStrip>. For a visitor who keeps
 * the page open past the deadline, the clock returns null and the bar removes
 * itself — nobody is left looking at a sale that has ended.
 *
 * The clock cells show "--" in the server HTML and until hydration: a real
 * time baked into cacheable HTML would be wrong for every later visitor.
 */
export function BlackFridayBar() {
  const t = useTranslate();
  const localize = useLocalizedHref();
  const time = useBlackFridayCountdown();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (mounted && !time) return null;

  const pad = (value?: number) =>
    value === undefined ? '--' : String(value).padStart(2, '0');

  return (
    <Link
      className="bf-bar"
      to={localize(`/collections/${BLACK_FRIDAY.collection}`)}
      prefetch="intent"
      aria-label={t('Black Friday Sale')}
    >
      <span className="bf-bar-inner">
        <span className="bf-bar-tag">{t('BLACK FRIDAY SALE')}</span>
        <span className="bf-bar-text">
          <b>
            {t('Up to {percent}% off').replace(
              '{percent}',
              String(BLACK_FRIDAY.percent),
            )}
          </b>{' '}
          · {t('no code needed')}
        </span>
        <span className="bf-bar-clock" aria-hidden="true">
          <Cell value={pad(time?.days)} label={t('Days')} />
          <span className="bf-bar-sep">:</span>
          <Cell value={pad(time?.hours)} label={t('Hours')} />
          <span className="bf-bar-sep">:</span>
          <Cell value={pad(time?.minutes)} label={t('Min.')} />
          <span className="bf-bar-sep">:</span>
          <Cell value={pad(time?.seconds)} label={t('Sec.')} />
        </span>
      </span>
    </Link>
  );
}

function Cell({value, label}: {value: string; label: string}) {
  return (
    <span className="bf-bar-cell">
      <b>{value}</b>
      <small>{label}</small>
    </span>
  );
}
