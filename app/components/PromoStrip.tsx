import {useEffect, useRef, useState} from 'react';
import {Link} from 'react-router';
import {
  PROMO,
  SECOND_PAIR,
  usePromoCountdown,
  type PromoTime,
} from '~/lib/promo';
import {useLocalizedHref} from '~/lib/localizedLink';
import {useTranslate} from '~/lib/useTranslate';

/**
 * The offer band that sits between the header and the hero: a rotator,
 * because stacking every live offer at once turns the top of the page into a
 * wall of shouting.
 *
 * Two slides, and which of them exist is decided at render:
 *   1. BTS10 — the dated campaign, and the ONLY slide with a clock.
 *   2. The 2nd-pair offer — automatic, no code, no clock.
 *
 * Only the dated slide comes and goes: when its window closes
 * `usePromoCountdown` returns null and it drops out by itself, with no
 * deploy. The band as a whole does NOT unmount with it — the 2nd-pair offer
 * has no end date, and taking it off the page when an unrelated campaign
 * expired was a bug fixed here. Do not reinstate an early return.
 */
/** Past this many pixels a horizontal drag counts as a swipe, not a tap. */
const SWIPE_THRESHOLD = 45;
/** How far the slide is allowed to follow the finger, for feedback only. */
const DRAG_CAP = 60;

/** Stand-in clock for the invisible sizer copy of the dated slide. */
const ZERO_TIME: PromoTime = {days: 0, hours: 0, minutes: 0, seconds: 0};

export function PromoStrip({reserveDated = false}: {reserveDated?: boolean}) {
  const time = usePromoCountdown();
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const [dragX, setDragX] = useState(0);
  /**
   * Touch bookkeeping in a ref, not state: it changes on every touchmove and
   * nothing renders from it, so putting it in state would re-render the
   * countdown dozens of times a second for nothing.
   *
   * `axis` latches on the first meaningful movement. Without it a mostly
   * vertical scroll that drifts sideways would start dragging the banner,
   * which on a phone feels like the page has snagged.
   */
  const touch = useRef<{
    x: number;
    y: number;
    axis: 'none' | 'x' | 'y';
  } | null>(null);

  /* `time` is null until the campaign's window opens and again once it
     closes, so the dated slide is simply absent from the list rather than
     rendered empty. */
  const slides: Array<'bts' | 'second'> = [
    ...(time ? (['bts'] as const) : []),
    'second',
  ];
  const slideCount = slides.length;
  /* When the dated slide drops out mid-session the list shortens under the
     current index; clamp rather than render nothing. */
  const current = Math.min(slide, slideCount - 1);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(
      () => setSlide((n) => (n + 1) % slideCount),
      6000,
    );
    return () => clearInterval(timer);
  }, [paused, slideCount]);

  const go = (direction: 1 | -1) =>
    setSlide((n) => (n + direction + slideCount) % slideCount);

  const onTouchStart = (event: React.TouchEvent) => {
    const point = event.touches[0];
    touch.current = {x: point.clientX, y: point.clientY, axis: 'none'};
    setPaused(true);
  };

  const onTouchMove = (event: React.TouchEvent) => {
    const start = touch.current;
    if (!start) return;
    const point = event.touches[0];
    const dx = point.clientX - start.x;
    const dy = point.clientY - start.y;

    if (start.axis === 'none') {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      start.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (start.axis !== 'x') return;

    // Never preventDefault here: `touch-action: pan-y` already tells the
    // browser which gestures are ours, and cancelling the event outright
    // would take vertical scrolling away from anyone whose finger lands on
    // the banner.
    setDragX(Math.max(-DRAG_CAP, Math.min(DRAG_CAP, dx)));
  };

  const onTouchEnd = () => {
    const start = touch.current;
    touch.current = null;
    setPaused(false);
    const travelled = dragX;
    setDragX(0);
    if (start?.axis !== 'x') return;
    if (Math.abs(travelled) < SWIPE_THRESHOLD) return;
    go(travelled < 0 ? 1 : -1);
  };

  return (
    <section
      className="promo-strip"
      aria-label="Current offers"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <span className="promo-strip-sheen" aria-hidden="true" />
      <div className="promo-strip-inner">
        <div
          className="promo-strip-viewport"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          {/*
            * The two slides are different heights (the dated one carries a
            * code and a clock), and the band sits above the hero — so every
            * rotation, and the dated slide's arrival after hydration, used to
            * move the whole page by ~16px. That was the homepage's entire
            * CLS (0.10 in PageSpeed), and it repeated every six seconds.
            *
            * Both slides are therefore always in the box as invisible sizers,
            * stacked in one grid cell with the live slide, so the box is as
            * tall as the taller of them at every width and in every language
            * and never changes. `reserveDated` comes from the loader, so the
            * server HTML already holds the dated slide's height.
            */}
          <div className="promo-strip-stack">
            {reserveDated || time ? (
              <div className="promo-strip-slide is-sizer" aria-hidden="true">
                <CodeSlide time={ZERO_TIME} sizer />
              </div>
            ) : null}
            <div className="promo-strip-slide is-sizer" aria-hidden="true">
              <SecondPairSlide sizer />
            </div>
            <div
              className="promo-strip-slide"
              key={slides[current]}
              style={
                dragX
                  ? {transform: `translateX(${dragX}px)`, animation: 'none'}
                  : undefined
              }
            >
              {slides[current] === 'bts' && time ? (
                <CodeSlide time={time} />
              ) : (
                <SecondPairSlide />
              )}
            </div>
          </div>
        </div>

        <div className="promo-strip-dots" role="tablist" aria-label="Offers">
          {slides.map((name, index) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={current === index}
              aria-label={`Offer ${index + 1}`}
              className={`promo-strip-dot${current === index ? ' is-on' : ''}`}
              onClick={() => setSlide(index)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/** Owns the clipboard quirks and the "Copied" timer for the code slide. */
function CopyCode({code}: {code: string}) {
  const t = useTranslate();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  // Not `async`: an onClick handler must return void. Clipboard access is
  // blocked in some in-app browsers and on insecure origins — the code is on
  // screen either way, so a failure is ignored rather than thrown at someone
  // mid-shop.
  const copy = () => {
    navigator.clipboard
      ?.writeText(code)
      .then(() => setCopied(true))
      .catch(() => {});
  };

  return (
    <button
      type="button"
      className="promo-strip-code"
      onClick={copy}
      aria-label={t('Copy discount code')}
    >
      <span className="promo-strip-code-value">{code}</span>
      <span className="promo-strip-code-hint">
        {copied ? t('Copied') : t('Copy')}
      </span>
    </button>
  );
}

/**
 * `sizer` renders the same boxes with nothing interactive or announced in
 * them — the copy exists only to hold the band's height (see PromoStrip).
 */
function CodeSlide({time, sizer = false}: {time: PromoTime; sizer?: boolean}) {
  const t = useTranslate();

  return (
    <>
      <p className="promo-strip-title">
        <span className="promo-strip-figure">{PROMO.percent}%</span>
        <span>{t('off everything')}</span>
      </p>
      <p className="promo-strip-note">{t('Back to School')}</p>

      {sizer ? (
        <span className="promo-strip-code">
          <span className="promo-strip-code-value">{PROMO.code}</span>
          <span className="promo-strip-code-hint">{t('Copy')}</span>
        </span>
      ) : (
        <CopyCode code={PROMO.code} />
      )}

      <div className="promo-strip-clock">
        <ClockCell value={time.days} label={t('days')} />
        <ClockCell value={time.hours} label={t('hrs')} />
        <ClockCell value={time.minutes} label={t('min')} />
        <ClockCell value={time.seconds} label={t('sec')} />
      </div>

      {/* One calm, non-ticking summary for screen readers: announcing a
          countdown every second would talk over the whole page. */}
      {sizer ? null : (
        <span className="sr-only" aria-live="polite">
          {t('{days} days and {hours} hours left')
            .replace('{days}', String(time.days))
            .replace('{hours}', String(time.hours))}
        </span>
      )}
    </>
  );
}

function SecondPairSlide({sizer = false}: {sizer?: boolean}) {
  const t = useTranslate();
  const localize = useLocalizedHref();
  return (
    <>
      <p className="promo-strip-title">
        <span className="promo-strip-figure">{SECOND_PAIR.percent}%</span>
        <span>{t('off your 2nd pair')}</span>
      </p>
      <p className="promo-strip-note">
        {t('On sneakers · applied automatically, no code needed')}
      </p>
      {sizer ? (
        <span className="promo-strip-cta">
          {t('Shop sneakers')}
          <span aria-hidden="true">→</span>
        </span>
      ) : (
        <Link
          className="promo-strip-cta"
          to={localize('/collections/sneakers')}
          prefetch="intent"
        >
          {t('Shop sneakers')}
          <span aria-hidden="true">→</span>
        </Link>
      )}
    </>
  );
}

function ClockCell({value, label}: {value: number; label: string}) {
  return (
    <span className="promo-strip-cell">
      <span className="promo-strip-num">{String(value).padStart(2, '0')}</span>
      <span className="promo-strip-label">{label}</span>
    </span>
  );
}
