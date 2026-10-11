import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {createPortal} from 'react-dom';
import {Link} from 'react-router';

import {SHOP} from '~/data/shop';
import {useLocalizedHref} from '~/lib/localizedLink';
import {useTranslate} from '~/lib/useTranslate';

/**
 * One card of a story. Copy arrives already translated.
 *
 * - Photo slide: `image` + `text`. The photo is always shown whole (never
 *   cropped) on a blurred copy of itself, with the text in a card below.
 * - Text slide: no `image`; `title` + `points` on the brand background.
 */
export type StorySlide = {
  tag: string;
  /** Path under `public/` (plain JPEG — see TrustStories). */
  image?: string;
  title?: string;
  text?: ReactNode;
  points?: ReactNode[];
  /** 'steps' numbers the points (1, 2, 3); 'check' ticks them. */
  list?: 'check' | 'steps';
  cta?: {label: string; to: string};
};

export type Story = {id: string; label: string; slides: StorySlide[]};

/** How long a slide stays up before the next one, unless held. */
const SLIDE_MS = 6500;
/** Text slides carry more to read, so they stay up longer. */
const TEXT_SLIDE_MS = 10000;
/** A press longer than this is "hold to pause", not a tap. */
const TAP_MS = 250;
/** A drag this far (px) is a swipe rather than a tap. */
const SWIPE_PX = 60;

type Position = {story: number; slide: number; run: number};

/**
 * Instagram-style story viewer: a 9:16 card over the dimmed page (on a phone
 * too — it never takes the whole screen), with a progress bar per slide, tap
 * right / left to move, hold to pause, swipe down or Esc to close. After the
 * last slide of one story it carries on into the next, like Instagram does
 * between highlights, and closes after the last.
 *
 * The timer IS the progress bar: the active bar runs a CSS animation and its
 * `animationend` moves to the next slide, so pausing is just
 * `animation-play-state: paused` — while held, while the tab is hidden and
 * until the slide's photo has loaded. With reduced motion the bars don't
 * animate and nothing advances on its own; taps and arrows still work.
 *
 * Rendered into <body> through a portal so no transformed ancestor on the
 * product page can clip it, and only ever mounted on the client (it opens
 * from a click), so there is nothing to hydrate.
 */
export function StoryViewer({
  stories,
  startAt,
  onClose,
}: {
  stories: Story[];
  startAt: number;
  onClose: () => void;
}) {
  const t = useTranslate();
  const localize = useLocalizedHref();
  const [pos, setPos] = useState<Position>({story: startAt, slide: 0, run: 0});
  const [held, setHeld] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const press = useRef<{at: number; x: number; y: number} | null>(null);

  const story = stories[pos.story];
  const slide = story.slides[pos.slide];
  const waiting = slide.image ? loadedSrc !== slide.image : false;
  const paused = held || hidden || waiting;

  const go = useCallback(
    (step: 1 | -1) => {
      const current = stories[pos.story];
      if (step === 1) {
        if (pos.slide < current.slides.length - 1) {
          setPos({...pos, slide: pos.slide + 1});
        } else if (pos.story < stories.length - 1) {
          setPos({story: pos.story + 1, slide: 0, run: pos.run});
        } else {
          onClose();
        }
      } else if (pos.slide > 0) {
        setPos({...pos, slide: pos.slide - 1});
      } else if (pos.story > 0) {
        const previous = stories[pos.story - 1];
        setPos({
          story: pos.story - 1,
          slide: previous.slides.length - 1,
          run: pos.run,
        });
      } else {
        // Already on the very first slide: start it again, as Instagram does.
        setPos({...pos, run: pos.run + 1});
      }
    },
    [pos, stories, onClose],
  );

  // Open: lock the page behind, move focus in, pause while the tab is
  // hidden. Close: undo all of it and hand focus back to the circle.
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    closeRef.current?.focus({preventScroll: true});
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      root.style.overflow = overflow;
      document.removeEventListener('visibilitychange', onVisibility);
      opener?.focus({preventScroll: true});
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        go(1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        go(-1);
      } else if (event.key === 'Tab') {
        trapFocus(event, dialogRef.current);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  // Warm the next photo so the following slide doesn't open on black.
  useEffect(() => {
    const upcoming =
      story.slides[pos.slide + 1] ?? stories[pos.story + 1]?.slides[0];
    if (upcoming?.image) new Image().src = upcoming.image;
  }, [pos.slide, pos.story, story, stories]);

  // A cached photo can finish before React attaches onLoad, so check once
  // on mount as well.
  const checkLoaded = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete) setLoadedSrc(img.getAttribute('src'));
  }, []);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if ((event.target as Element).closest('a, button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    press.current = {at: event.timeStamp, x: event.clientX, y: event.clientY};
    setHeld(true);
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = press.current;
    press.current = null;
    setHeld(false);
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (dy > SWIPE_PX && dy > Math.abs(dx)) {
      onClose();
    } else if (Math.abs(dx) > SWIPE_PX) {
      go(dx < 0 ? 1 : -1);
    } else if (event.timeStamp - start.at <= TAP_MS) {
      const box = event.currentTarget.getBoundingClientRect();
      go(event.clientX - box.left < box.width / 3 ? -1 : 1);
    }
  }

  function onPointerCancel() {
    press.current = null;
    setHeld(false);
  }

  const cta = slide.cta ? (
    <Link
      className="sv-cta"
      to={localize(slide.cta.to)}
      prefetch="intent"
      onClick={onClose}
    >
      {slide.cta.label}
      <span aria-hidden="true">→</span>
    </Link>
  ) : null;

  const List = slide.list === 'steps' ? 'ol' : 'ul';

  return createPortal(
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={dialogRef}
      className="sv-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={story.label}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        className="sv-nav"
        aria-label={t('Previous')}
        onClick={() => go(-1)}
      >
        <Chevron direction="left" />
      </button>

      <div
        className={`sv-frame${slide.image ? '' : ' is-text'}`}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {slide.image ? (
          <>
            <img
              key={`fill-${slide.image}`}
              className="sv-image sv-image-fill"
              src={slide.image}
              alt=""
              draggable={false}
              decoding="async"
            />
            <img
              key={slide.image}
              ref={checkLoaded}
              className="sv-image"
              src={slide.image}
              alt=""
              draggable={false}
              decoding="async"
              onLoad={() => setLoadedSrc(slide.image ?? null)}
              onError={() => setLoadedSrc(slide.image ?? null)}
            />
          </>
        ) : null}

        <div className="sv-top">
          <div className="sv-bars" aria-hidden="true">
            {story.slides.map((item, index) => {
              const active = index === pos.slide;
              return (
                <span key={item.tag} className="sv-bar">
                  <span
                    key={
                      active ? `run-${pos.story}-${pos.slide}-${pos.run}` : 'idle'
                    }
                    className={`sv-bar-fill${
                      index < pos.slide ? ' is-done' : active ? ' is-active' : ''
                    }`}
                    style={
                      active
                        ? {
                            animationDuration: `${
                              item.image ? SLIDE_MS : TEXT_SLIDE_MS
                            }ms`,
                            animationPlayState: paused ? 'paused' : 'running',
                          }
                        : undefined
                    }
                    onAnimationEnd={active ? () => go(1) : undefined}
                  />
                </span>
              );
            })}
          </div>
          <div className="sv-head">
            <img
              className="sv-avatar"
              src="/icon-192.png"
              alt=""
              width={34}
              height={34}
            />
            <span className="sv-head-text">
              <strong>{SHOP.name}</strong>
              <span>{story.label}</span>
            </span>
            <button
              ref={closeRef}
              type="button"
              className="sv-close"
              aria-label={t('Close')}
              onClick={onClose}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {slide.image ? (
          <div className="sv-caption" aria-live="polite">
            <span className="sv-tag">{slide.tag}</span>
            <div className="sv-card">
              <p>{slide.text}</p>
              {cta}
            </div>
          </div>
        ) : (
          <div key={slide.tag} className="sv-text" aria-live="polite">
            <span className="sv-tag">{slide.tag}</span>
            {slide.title ? <h2 className="sv-title">{slide.title}</h2> : null}
            {slide.text ? <p className="sv-lead">{slide.text}</p> : null}
            {slide.points ? (
              <List className={`sv-points${slide.list === 'steps' ? ' is-steps' : ''}`}>
                {slide.points.map((point, index) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <li key={index}>
                    <span className="sv-point-mark" aria-hidden="true">
                      {slide.list === 'steps' ? index + 1 : <Tick />}
                    </span>
                    <span>{point}</span>
                  </li>
                ))}
              </List>
            ) : null}
            {cta}
          </div>
        )}
      </div>

      <button
        type="button"
        className="sv-nav"
        aria-label={t('Next')}
        onClick={() => go(1)}
      >
        <Chevron direction="right" />
      </button>
    </div>,
    document.body,
  );
}

function Chevron({direction}: {direction: 'left' | 'right'}) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Tick() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14">
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Keep Tab / Shift+Tab inside the open viewer. */
function trapFocus(event: KeyboardEvent, root: HTMLElement | null) {
  if (!root) return;
  const items = Array.from(
    root.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
  );
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !root.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !root.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}
