import {useEffect, useState} from 'react';
import {Link} from 'react-router';
import {BLACK_FRIDAY, useBlackFridayCountdown} from '~/lib/promo';
import {useLocalizedHref} from '~/lib/localizedLink';
import {useTranslate} from '~/lib/useTranslate';

/**
 * The deals bar (MERA-style) at the top of the homepage, in place of the
 * offer band.
 *
 * The deals themselves — reduced prices on the products — run on after Black
 * Friday; only the event's NAME and its clock are dated (owner, 26 Nov 2026).
 * So the bar has two faces:
 *   - Black Friday window open: "BLACK FRIDAY SALE" + a countdown.
 *   - Afterwards: "SALE" + "Shop the deals", no clock.
 *
 * `blackFriday` comes from the homepage loader (checked per request). For a
 * visitor who keeps the page open past the deadline the clock returns null
 * and the bar turns into its "SALE" face on the spot.
 *
 * The clock shows "--" in the server HTML and until hydration: a real time
 * baked into cacheable HTML would be wrong for every later visitor.
 */
export function BlackFridayBar({blackFriday}: {blackFriday: boolean}) {
  const t = useTranslate();
  const localize = useLocalizedHref();
  const time = useBlackFridayCountdown();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isEvent = blackFriday && (!mounted || time !== null);
  const pad = (value?: number) =>
    value === undefined ? '--' : String(value).padStart(2, '0');
  const headline = t('Up to {percent}% off').replace(
    '{percent}',
    String(BLACK_FRIDAY.percent),
  );

  return (
    <Link
      className="bf-bar"
      to={localize(`/collections/${BLACK_FRIDAY.collection}`)}
      prefetch="intent"
      aria-label={isEvent ? t('Black Friday Sale') : t('Sale')}
    >
      <span className="bf-bar-inner">
        <span className="bf-bar-tag">
          {isEvent ? t('BLACK FRIDAY SALE') : t('SALE')}
        </span>
        <span className="bf-bar-text">
          <b>{headline}</b> · {t('no code needed')}
        </span>
        {isEvent ? (
          <span className="bf-bar-clock" aria-hidden="true">
            <Cell value={pad(time?.days)} label={t('Days')} />
            <span className="bf-bar-sep">:</span>
            <Cell value={pad(time?.hours)} label={t('Hours')} />
            <span className="bf-bar-sep">:</span>
            <Cell value={pad(time?.minutes)} label={t('Min.')} />
            <span className="bf-bar-sep">:</span>
            <Cell value={pad(time?.seconds)} label={t('Sec.')} />
          </span>
        ) : (
          <span className="bf-bar-cta">
            {t('Shop the deals')}
            <span aria-hidden="true">→</span>
          </span>
        )}
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
