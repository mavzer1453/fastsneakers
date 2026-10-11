import {useEffect, useState} from 'react';

/**
 * The live campaign, in one place.
 *
 * These timestamps MUST match the Shopify discount `BTS10` exactly
 * (gid://shopify/DiscountCodeNode/2287616885068). If they drift, the
 * storefront advertises a code that checkout rejects — the worst version of
 * this feature, because the shopper only finds out after filling a basket.
 *
 * Stored in UTC: the store runs on Brussels time, which is UTC+2 in summer
 * and UTC+1 in winter, so a local-looking string would silently move by an
 * hour at the DST boundary.
 */
export const PROMO = {
  code: 'BTS10',
  percent: 10,
  /** 21 Sep 2026, 13:58 Brussels. */
  startsAt: '2026-09-21T11:58:00Z',
  /** 17 Oct 2026, 23:59 Brussels (CEST, UTC+2). Extended on 3 Oct from 5 Oct. */
  endsAt: '2026-10-17T21:59:00Z',
} as const;

/**
 * The standing sneaker offer: a percentage off the second pair in the basket,
 * applied automatically at checkout with no code.
 *
 * The discount itself lives in Shopify admin (Discounts -> the automatic
 * "2nd pair" discount), NOT in this repo, and this number only controls what
 * the storefront SAYS. The two must match: advertise 10% while Shopify still
 * takes off 5% and the shopper finds out at checkout. Change the discount in
 * admin first, then this, then deploy.
 */
export const SECOND_PAIR = {percent: 10} as const;

export type PromoTime = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

function remaining(now: number): PromoTime | null {
  const start = Date.parse(PROMO.startsAt);
  const end = Date.parse(PROMO.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (now < start || now >= end) return null;
  const total = Math.floor((end - now) / 1000);
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/**
 * Whether the dated campaign is inside its window at `now`.
 *
 * For the SERVER: the homepage loader calls this once per request and hands
 * the answer to <PromoStrip> as `reserveDated`, so the band can hold the dated
 * slide's height from the first byte without printing a clock into cacheable
 * HTML. Going through loader data (rather than calling Date.now() in the
 * component) is what keeps a cached response and its hydration in agreement.
 */
export function isPromoLive(now: number): boolean {
  return remaining(now) !== null;
}

/**
 * Time left on the promo, or null when it has not started, has ended, or has
 * not been measured yet.
 *
 * Deliberately null on the server and on the first client render. A
 * countdown rendered during SSR is already stale by the time it hydrates —
 * React flags the mismatch — and worse, this page is CDN-cached, so a baked-in
 * "ends in 6d 04:11:02" would be served to every later visitor. Rendering it
 * only on the client keeps the HTML cacheable and the clock honest.
 *
 * The null return is also what switches the whole campaign off: when the end
 * time passes, the banner message and the homepage strip stop rendering by
 * themselves, with no deploy needed.
 */
export function usePromoCountdown(): PromoTime | null {
  const [time, setTime] = useState<PromoTime | null>(null);

  useEffect(() => {
    const tick = () => setTime(remaining(Date.now()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  return time;
}

/** `6d 04:11:02` — days only while there are any. */
export function formatPromoTime(time: PromoTime): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const clock = `${pad(time.hours)}:${pad(time.minutes)}:${pad(time.seconds)}`;
  return time.days > 0 ? `${time.days}d ${clock}` : clock;
}
