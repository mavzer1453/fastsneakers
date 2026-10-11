import {useEffect, useRef, useState, useSyncExternalStore} from 'react';
import {Link} from 'react-router';
import {Money} from '@shopify/hydrogen';
import {
  HERO_TILES,
  HERO_VIDEO,
  HERO_VIDEO_POSTER,
  HERO_VIDEO_PRODUCT,
  heroSrcSet,
  type HeroTile,
} from '~/data/heroTiles';
import {useLocalizedHref} from '~/lib/localizedLink';
import {useTranslate} from '~/lib/useTranslate';

export type HeroPrice = {amount: string; currencyCode: string};

const SWIPE_THRESHOLD = 45;
/** Trackpad travel, in wheel pixels, that counts as one deliberate swipe. */
const WHEEL_THRESHOLD = 70;
/** Width at which the banner becomes the 2 - 1 - 2 stage. */
const WIDE_QUERY = '(min-width: 64em)';

type Slide = {kind: 'photo'; tile: HeroTile} | {kind: 'video'};

/** The clip sits at the midpoint, so the run stays balanced as tiles grow. */
function slidesFor(tiles: HeroTile[], withVideo: boolean): Slide[] {
  const photos = tiles.map((tile): Slide => ({kind: 'photo', tile}));
  if (!withVideo) return photos;
  const at = Math.ceil(tiles.length / 2);
  return [...photos.slice(0, at), {kind: 'video'}, ...photos.slice(at)];
}

/*
 * On a wide screen the four collection tiles move out of the run and become
 * the fixed wings, two a side, leaving the sneakers to slide through the
 * middle. Splitting on `kind` rather than on position is what keeps the two
 * halves coherent: a wing is a standing shortcut to a shelf, the middle is
 * the thing that changes.
 */
const WING_TILES = HERO_TILES.filter((tile) => tile.kind === 'collection').slice(
  0,
  4,
);
const WING_IDS = new Set(WING_TILES.map((tile) => tile.id));

/** Phone and tablet: everything slides, clip included, nothing is dropped. */
const NARROW_SLIDES = slidesFor(HERO_TILES, true);
/*
 * Wide: whatever the wings did not take, and no clip.
 *
 * The clip earns its place on a phone, where it is the full width of the
 * screen and the only thing moving. On the stage it is one pane of five, so
 * it plays against four still photographs and reads as a banner ad rather
 * than as the hero.
 */
const WIDE_SLIDES = slidesFor(
  HERO_TILES.filter((tile) => !WING_IDS.has(tile.id)),
  false,
);

/**
 * Whether the viewport is wide enough for the stage.
 *
 * The server has no viewport, so it answers false and ships the phone run.
 * The wings are in that markup either way and CSS reveals them, so the only
 * thing this switches is which tiles the middle holds — and the first slide
 * is the same tile in both lists, so nothing visibly jumps at hydration.
 */
function useWideScreen(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(WIDE_QUERY);
      query.addEventListener('change', notify);
      return () => query.removeEventListener('change', notify);
    },
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );
}

/**
 * The banner, as a real sliding carousel.
 *
 * Every slide is in the DOM at once on one track, and changing slide moves
 * the track with a CSS transform. The previous version swapped a single
 * element in and out and cross-faded it, which is what made it look glitchy:
 * React tore down one image and mounted the next, so the browser decoded a
 * fresh image mid-animation and flashed the empty card underneath.
 *
 * Dragging writes straight onto the same transform, so a swipe and the
 * auto-advance are the same motion rather than two competing ones.
 */
export function HeroCollage({prices}: {prices: Record<string, HeroPrice>}) {
  const t = useTranslate();
  const wide = useWideScreen();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const touch = useRef<{x: number; y: number; axis: 'none' | 'x' | 'y'} | null>(
    null,
  );

  const slides = wide ? WIDE_SLIDES : NARROW_SLIDES;
  const count = slides.length;
  const isVideo = slides[index]?.kind === 'video';

  /*
   * The two runs are different lengths, so a resize across the breakpoint can
   * leave the index past the end. Clamping here rather than resetting to zero
   * keeps the shopper roughly where they were.
   */
  useEffect(() => {
    setIndex((n) => Math.min(n, count - 1));
  }, [count]);

  useEffect(() => {
    if (paused) return;
    // The clip gets a longer beat than a still — roughly one loop, where a
    // still's four and a half seconds would cut it mid-motion.
    const hold = isVideo ? 6500 : 4500;
    const timer = setTimeout(() => setIndex((n) => (n + 1) % count), hold);
    return () => clearTimeout(timer);
  }, [paused, index, count, isVideo]);

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
      // Latch the axis on first movement: a vertical scroll that drifts
      // sideways must not start dragging the banner.
      start.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (start.axis === 'x') setDragging(true);
    }
    if (start.axis !== 'x') return;
    // Resist at the ends rather than sliding into blank space.
    const atEdge =
      (index === 0 && dx > 0) || (index === count - 1 && dx < 0);
    setDragX(atEdge ? dx * 0.25 : dx);
  };

  const onTouchEnd = () => {
    const start = touch.current;
    touch.current = null;
    setPaused(false);
    setDragging(false);
    const travelled = dragX;
    setDragX(0);
    if (start?.axis !== 'x') return;
    if (Math.abs(travelled) < SWIPE_THRESHOLD) return;
    setIndex((n) =>
      Math.max(0, Math.min(count - 1, n + (travelled < 0 ? 1 : -1))),
    );
  };

  /*
   * The track is offset in pixels, not percent, so a drag and the settled
   * position use the same unit and can't disagree mid-gesture. That means the
   * viewport width has to be state: read from a ref alone it would be 0 on the
   * first paint and stale after every resize or orientation change.
   */
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const sync = () => setWidth(node.clientWidth);
    // Not called directly: the observer reports once on `observe`, after
    // layout, so the read is free. Called from this effect it forced a
    // synchronous layout of the whole page right after hydration. Until that
    // first report `width` is 0, which is harmless — the index is 0 too, so
    // the offset is 0 either way.
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /*
   * A trackpad has no touch events, so on a laptop the same sideways flick
   * arrives as a wheel with a horizontal delta. Read passively and never
   * prevented: a vertical scroll that drifts sideways keeps scrolling the
   * page, and only a clearly horizontal run moves the banner.
   */
  const wheelTravel = useRef(0);
  const wheelLock = useRef(0);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) + 4) return;
      const now = Date.now();
      if (now < wheelLock.current) return;
      wheelTravel.current += event.deltaX;
      if (Math.abs(wheelTravel.current) < WHEEL_THRESHOLD) return;
      const step = wheelTravel.current > 0 ? 1 : -1;
      wheelTravel.current = 0;
      wheelLock.current = now + 420;
      setIndex((n) => Math.max(0, Math.min(count - 1, n + step)));
    };
    node.addEventListener('wheel', onWheel, {passive: true});
    return () => node.removeEventListener('wheel', onWheel);
  }, [count]);

  const offset = -index * width + dragX;
  const go = (step: number) =>
    setIndex((n) => Math.max(0, Math.min(count - 1, n + step)));

  return (
    <section
      className="hero-show"
      aria-label={t('Featured products')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/*
        * The wings are always in the markup and CSS decides whether they are
        * on screen. Rendering them only on a wide viewport would mean waiting
        * for JavaScript to know the width, which is a visible pop. Costing a
        * phone nothing is not the reason it works — the wings point at the
        * same four photographs the narrow run already carries, so there is no
        * second download either way.
        */}
      <div className="hero-show-stage">
        <HeroWing tiles={WING_TILES.slice(0, 2)} prices={prices} side="left" />

        <div className="hero-show-main">
          <div
            className="hero-show-viewport"
            ref={viewport}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchEnd}
          >
            <div
              className="hero-show-track"
              style={{
                transform: `translate3d(${offset}px, 0, 0)`,
                // No easing while a finger is down: the track must track the
                // finger exactly, and only glide once it lets go.
                transition: dragging ? 'none' : undefined,
              }}
            >
              {slides.map((slide, position) =>
                slide.kind === 'video' ? (
                  <HeroVideo
                    key="video"
                    active={position === index}
                    near={Math.abs(position - index) <= 1}
                    price={prices[HERO_VIDEO_PRODUCT.id]}
                  />
                ) : (
                  <HeroPhoto
                    key={slide.tile.id}
                    tile={slide.tile}
                    price={prices[slide.tile.id]}
                    eager={position === 0}
                  />
                ),
              )}
            </div>
          </div>

          {/* Mouse-only controls: a pointer has nothing to swipe with. */}
          <button
            type="button"
            className="hero-show-arrow is-prev"
            aria-label={t('Previous slide')}
            onClick={() => go(-1)}
            disabled={index === 0}
          >
            <span aria-hidden="true">←</span>
          </button>
          <button
            type="button"
            className="hero-show-arrow is-next"
            aria-label={t('Next slide')}
            onClick={() => go(1)}
            disabled={index === count - 1}
          >
            <span aria-hidden="true">→</span>
          </button>
        </div>

        <HeroWing tiles={WING_TILES.slice(2, 4)} prices={prices} side="right" />
      </div>

      <div className="hero-show-dots" role="tablist" aria-label={t('Slides')}>
        {slides.map((item, dot) => (
          <button
            key={item.kind === 'video' ? 'video' : item.tile.id}
            type="button"
            role="tab"
            aria-selected={dot === index}
            aria-label={item.kind === 'video' ? t('Clip') : item.tile.label}
            className={`hero-show-dot${dot === index ? ' is-on' : ''}`}
            onClick={() => setIndex(dot)}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * One side of the stage: two standing shortcuts to a shelf.
 *
 * These do not slide. That is the point of the layout — the middle is what
 * changes, and the wings are always the same four doors, so a shopper who
 * came back for the Stussy shelf can find it without waiting out a carousel.
 */
function HeroWing({
  tiles,
  prices,
  side,
}: {
  tiles: HeroTile[];
  prices: Record<string, HeroPrice>;
  side: 'left' | 'right';
}) {
  const t = useTranslate();
  const localize = useLocalizedHref();

  return (
    <div className={`hero-show-wing is-${side}`}>
      {tiles.map((tile) => {
        const price = prices[tile.id];
        const to = tile.handle
          ? `/products/${tile.handle}`
          : `/collections/${tile.collection}`;
        return (
          <Link
            key={tile.id}
            className="hero-wing-tile"
            to={localize(to)}
            prefetch="intent"
          >
            {/* Lazy so the wings never bid against the first slide for
                bandwidth. They are the same files the narrow run shows, so
                on a phone this is a cache hit rather than a download. */}
            <HeroPicture
              tile={tile}
              className="hero-wing-img"
              sizes={WING_SIZES}
              eager={false}
            />
            <span className="hero-wing-scrim" aria-hidden="true" />
            <span className="hero-wing-copy">
              <span className="hero-wing-label">{tile.label}</span>
              {price ? (
                <span className="hero-wing-price">
                  {tile.kind === 'collection' ? (
                    <span className="hero-wing-from">{t('From')}</span>
                  ) : null}
                  <Money
                    data={{
                      amount: price.amount,
                      currencyCode: price.currencyCode as never,
                    }}
                  />
                </span>
              ) : null}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/*
 * How wide each photo is actually drawn, so the browser can pick a file.
 * Below the stage breakpoint a slide is the full width of the screen; on the
 * stage the middle takes 2.4 of 3.6 columns and each wing 0.6 of them, inside
 * a banner that stops growing at 1720px.
 */
const SLIDE_SIZES =
  '(min-width: 107.5em) 1140px, (min-width: 64em) 66vw, calc(100vw - 2rem)';
const WING_SIZES = '(min-width: 107.5em) 290px, 17vw';

/**
 * One hero photograph: AVIF where it is understood, WebP otherwise, and the
 * original JPEG for anything older than both.
 *
 * `display: contents` takes the <picture> box out of layout, so the <img>
 * still sizes against the cell exactly as it did when it stood alone — the
 * CSS that positions `.hero-show-img` and `.hero-wing-img` is untouched.
 */
function HeroPicture({
  tile,
  className,
  sizes,
  eager,
}: {
  tile: HeroTile;
  className: string;
  sizes: string;
  eager: boolean;
}) {
  return (
    <picture style={{display: 'contents'}}>
      <source type="image/avif" srcSet={heroSrcSet(tile, 'avif')} sizes={sizes} />
      <source type="image/webp" srcSet={heroSrcSet(tile, 'webp')} sizes={sizes} />
      <img
        className={className}
        src={tile.image}
        width={tile.width}
        height={tile.height}
        alt=""
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : 'auto'}
        decoding={eager ? 'sync' : 'async'}
        draggable={false}
      />
    </picture>
  );
}

function HeroPhoto({
  tile,
  price,
  eager,
}: {
  tile: HeroTile;
  price?: HeroPrice;
  eager: boolean;
}) {
  const t = useTranslate();
  const localize = useLocalizedHref();
  const to = tile.handle
    ? `/products/${tile.handle}`
    : `/collections/${tile.collection}`;

  return (
    <Link className="hero-show-cell" to={localize(to)} prefetch="intent">
      {/* Desktop only (hidden below 64em in app.css): the portrait photo is
          shown whole in the 16:9 slide, and this blurred copy of the same
          file fills the space either side. Same src + sizes as the photo
          itself, so the browser reuses the download. */}
      <HeroPicture
        tile={tile}
        className="hero-show-backdrop"
        sizes={SLIDE_SIZES}
        eager={eager}
      />
      <HeroPicture
        tile={tile}
        className="hero-show-img"
        sizes={SLIDE_SIZES}
        eager={eager}
      />
      <span className="hero-show-scrim" aria-hidden="true" />
      <span className="hero-show-copy">
        <span className="hero-show-eyebrow">{t('Most wanted')}</span>
        <span className="hero-show-label">{tile.label}</span>
        {price ? (
          <span className="hero-show-price">
            {/* A collection tile opens a whole shelf, so its number is the
                floor price and has to say so — quoting it bare would read as
                "this photo costs that". */}
            {tile.kind === 'collection' ? (
              <span className="hero-show-from">{t('From')}</span>
            ) : null}
            {/* `currencyCode` arrives as a plain string from the price
                lookup; Money wants the generated CurrencyCode union. */}
            <Money
              data={{
                amount: price.amount,
                currencyCode: price.currencyCode as never,
              }}
            />
          </span>
        ) : null}
        <span className="hero-show-cta">
          {t('Shop now')}
          <span aria-hidden="true">→</span>
        </span>
      </span>
    </Link>
  );
}

/**
 * Autoplay is only permitted muted, and is only worth starting while the clip
 * is the slide on screen — otherwise the browser decodes video nobody sees.
 *
 * The cell is a link, not a div: the clip sells a pair like every other slide
 * and has to open it when tapped.
 */
/*
 * The clip is the middle slide, so on a fresh page it is four slides — about
 * eighteen seconds — away, and most visits never reach it. With a `src` from
 * the start the browser fetched it anyway (1.6 MB, the largest request on the
 * page, competing with the hero photo on a phone). So the element gets no
 * source at all until the slide next to it is on screen (`near`); then the
 * poster and the file's first bytes load, and it is ready by the time it
 * slides in. Once armed it stays armed, so swiping back and forth never
 * re-requests it.
 */
function HeroVideo({
  active,
  near,
  price,
}: {
  active: boolean;
  near: boolean;
  price?: HeroPrice;
}) {
  const t = useTranslate();
  const localize = useLocalizedHref();
  const ref = useRef<HTMLVideoElement>(null);
  const [armed, setArmed] = useState(false);
  if (near && !armed) setArmed(true);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (!active) {
      video.pause();
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    video.currentTime = 0;
    void video.play().catch(() => {});
    // `armed` is a dependency so a slide that becomes active in the same
    // render that gives it a source still starts playing.
  }, [active, armed]);

  return (
    <Link
      className="hero-show-cell is-video"
      to={localize(`/products/${HERO_VIDEO_PRODUCT.handle}`)}
      prefetch="intent"
    >
      <video
        ref={ref}
        className="hero-show-video"
        src={armed ? HERO_VIDEO : undefined}
        poster={armed ? HERO_VIDEO_POSTER : undefined}
        muted
        loop
        playsInline
        preload={armed ? 'metadata' : 'none'}
        aria-hidden="true"
        tabIndex={-1}
      />
      <span className="hero-show-scrim" aria-hidden="true" />
      <span className="hero-show-copy">
        <span className="hero-show-eyebrow">{t('Most wanted')}</span>
        <span className="hero-show-label">{HERO_VIDEO_PRODUCT.label}</span>
        {price ? (
          <span className="hero-show-price">
            <Money
              data={{
                amount: price.amount,
                currencyCode: price.currencyCode as never,
              }}
            />
          </span>
        ) : null}
        <span className="hero-show-cta">
          {t('Shop now')}
          <span aria-hidden="true">→</span>
        </span>
      </span>
    </Link>
  );
}
