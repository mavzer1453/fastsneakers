import {Image} from '@shopify/hydrogen';
import {Suspense, useEffect, useState} from 'react';
import {Await, Link, useLocation} from 'react-router';

import type {LiveActivityItem} from '~/lib/liveActivity';
import {useLocalizedHref} from '~/lib/localizedLink';
import {useTranslate} from '~/lib/useTranslate';

/**
 * The live-activity popup: a small card in the bottom-left corner showing
 * what other shoppers are buying, and tapping it opens that product.
 *
 * Every card is backed by real data (see `app/lib/liveActivity.server.ts`) —
 * either an order actually placed in this shop, or Shopify's own bestseller
 * ranking. An empty feed renders nothing.
 */

/** Quiet stretch after load, so it doesn't fight the page for attention. */
const FIRST_DELAY_MS = 12_000;

/** One notification per minute, as long as the tab is in the foreground. */
const INTERVAL_MS = 60_000;

/** How long a card stays on screen before it slides away. */
const VISIBLE_MS = 7_000;

/** Matches the exit animation in app.css. */
const EXIT_MS = 260;

/** A dismissal lasts for the browsing session, not forever. */
const DISMISS_KEY = 'vc:live-activity-off';

/** Routes where a marketing popup would be in the way. */
const MUTED_PATHS = /\/(account|cart)(\/|$)/;

export function LiveActivity({
  items,
}: {
  items?: Promise<LiveActivityItem[]> | LiveActivityItem[];
}) {
  if (!items) return null;
  return (
    <Suspense fallback={null}>
      <Await resolve={items} errorElement={<></>}>
        {(resolved) => <LiveActivityTicker items={resolved ?? []} />}
      </Await>
    </Suspense>
  );
}

function shuffle<T>(input: T[]): T[] {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function LiveActivityTicker({items}: {items: LiveActivityItem[]}) {
  const t = useTranslate();
  const localize = useLocalizedHref();
  const location = useLocation();
  const [current, setCurrent] = useState<LiveActivityItem | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Session-scoped opt-out. Storage can throw (private mode, blocked
  // cookies), and a popup is not worth a crashed layout.
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(DISMISS_KEY)) setDismissed(true);
    } catch {
      /* no storage, no memory of the dismissal — fine */
    }
  }, []);

  // The whole schedule lives in one effect: nothing renders until the first
  // timer fires, which also keeps the server-rendered markup and the first
  // client render identical (no hydration mismatch from the shuffle).
  useEffect(() => {
    if (dismissed || items.length === 0) return;

    const order = shuffle(items);
    let index = 0;
    let cancelled = false;
    let hideTimer: ReturnType<typeof setTimeout>;
    let nextTimer: ReturnType<typeof setTimeout>;
    let exitTimer: ReturnType<typeof setTimeout>;

    const hide = () => {
      setLeaving(true);
      exitTimer = setTimeout(() => {
        if (cancelled) return;
        setCurrent(null);
        setLeaving(false);
      }, EXIT_MS);
    };

    const showNext = () => {
      if (cancelled) return;
      // Background tabs would otherwise burn through the whole queue while
      // nobody is looking; wait for the shopper to come back instead.
      if (typeof document !== 'undefined' && document.hidden) {
        nextTimer = setTimeout(showNext, 5_000);
        return;
      }
      setCurrent(order[index % order.length]);
      setLeaving(false);
      index += 1;
      hideTimer = setTimeout(hide, VISIBLE_MS);
      nextTimer = setTimeout(showNext, INTERVAL_MS);
    };

    nextTimer = setTimeout(showNext, FIRST_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(hideTimer);
      clearTimeout(nextTimer);
      clearTimeout(exitTimer);
    };
  }, [items, dismissed]);

  const dismiss = () => {
    setDismissed(true);
    setCurrent(null);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* see above */
    }
  };

  if (!current || MUTED_PATHS.test(location.pathname)) return null;

  const who =
    current.kind === 'order'
      ? current.name && current.place
        ? t('{name} in {place}')
            .replace('{name}', current.name)
            .replace('{place}', current.place)
        : current.place
          ? t('Someone in {place}').replace('{place}', current.place)
          : t('Recently ordered')
      : t('Bestseller');

  const when =
    current.kind === 'order'
      ? timeAgo(current.at, t)
      : t('Popular right now');

  return (
    <aside
      className={`live-activity${leaving ? ' is-leaving' : ''}`}
      aria-label={t('Recent activity')}
    >
      <Link
        className="live-activity-card"
        to={localize(`/products/${current.handle}`)}
        prefetch="intent"
      >
        <span className="live-activity-thumb" aria-hidden="true">
          {current.image ? (
            <Image
              data={current.image}
              alt=""
              sizes="64px"
              width={64}
              height={64}
              loading="lazy"
            />
          ) : null}
        </span>
        <span className="live-activity-body">
          <span className="live-activity-who">{who}</span>
          <span className="live-activity-title">{current.title}</span>
          <span className="live-activity-when">
            <span className="live-activity-dot" aria-hidden="true" />
            {when}
          </span>
        </span>
      </Link>
      <button
        type="button"
        className="live-activity-close"
        onClick={dismiss}
        aria-label={t('Dismiss')}
      >
        &times;
      </button>
    </aside>
  );
}

/** "3 hours ago", from the order's real timestamp. */
function timeAgo(at: string | null | undefined, t: (text: string) => string) {
  const placed = at ? Date.parse(at) : NaN;
  if (!Number.isFinite(placed)) return t('Recently');

  const minutes = Math.round((Date.now() - placed) / 60_000);
  if (minutes < 2) return t('Just now');
  if (minutes < 60) return t('{n} minutes ago').replace('{n}', String(minutes));

  const hours = Math.round(minutes / 60);
  if (hours === 1) return t('1 hour ago');
  if (hours < 24) return t('{n} hours ago').replace('{n}', String(hours));

  const days = Math.round(hours / 24);
  if (days <= 1) return t('Yesterday');
  return t('{n} days ago').replace('{n}', String(days));
}
