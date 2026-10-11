import {Image} from '@shopify/hydrogen';
import {useEffect, useMemo, useRef, useState} from 'react';
import {BsPatchCheck, BsShare} from 'react-icons/bs';

import {Emphasised} from '~/components/Emphasised';
import {useTranslate} from '~/lib/useTranslate';

export interface GalleryImage {
  id?: string | null;
  url: string;
  altText?: string | null;
  width?: number | null;
  height?: number | null;
}

/** Sideways travel, in px, before a swipe counts as "next photo". */
const SWIPE_THRESHOLD = 45;
/** Accumulated horizontal wheel delta before a trackpad flick counts. */
const WHEEL_THRESHOLD = 70;
/** How long "Link copied" stays up after a clipboard fallback. */
const SHARE_TOAST_MS = 2200;

/**
 * Product photos as a swiper — the same mechanics as the homepage banner
 * (`HeroCollage`): a track that follows the finger, resists at both ends and
 * glides to the next photo on release; arrows for a mouse; bar dots
 * underneath; a sideways trackpad flick pages it too.
 *
 * Two deliberate differences from the banner:
 * - It never advances on its own. A banner is there to be glanced at; a
 *   product photo is being inspected, and sliding away under the shopper's
 *   eyes would be hostile.
 * - A mouse still gets magnify-in-place on the photo in view, and the desktop
 *   thumbnail rail stays — both move the same index the swipe does.
 */
export function ProductGallery({
  images,
  selectedVariantImage,
  title,
}: {
  images: GalleryImage[];
  selectedVariantImage?: GalleryImage | null;
  title: string;
}) {
  const t = useTranslate();
  const gallery = useMemo(() => {
    const list: GalleryImage[] = [];
    const seen = new Set<string>();
    for (const image of [selectedVariantImage, ...images]) {
      if (!image?.url) continue;
      const key = image.id ?? image.url;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(image);
    }
    return list;
  }, [images, selectedVariantImage]);

  /*
   * The panel's photo is a plain <img>, not Hydrogen's <Image>: that
   * component writes an inline `style` for width/height, and an inline style
   * cannot be overridden from the stylesheet — it rendered full-bleed and
   * pushed the copy out of the (clipped) square. A hand-built CDN url keeps
   * the bytes small without the inline sizing.
   */
  const authnSrc = useMemo(() => {
    const url = gallery[0]?.url;
    if (!url) return '';
    try {
      const sized = new URL(url);
      sized.searchParams.set('width', '520');
      return sized.toString();
    } catch {
      return url;
    }
  }, [gallery]);

  const count = gallery.length;
  /* The authenticity panel rides at the end as slide `count`, so every
     navigation bound — clamping, arrows, dots, edge resistance — counts one
     more than there are photos. */
  const total = count + 1;
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const zoomLayer = useRef<HTMLDivElement>(null);
  const touch = useRef<{x: number; y: number; axis: 'none' | 'x' | 'y'} | null>(
    null,
  );

  // Picking another colour puts that variant's photo first: start there.
  const variantImageKey = selectedVariantImage?.id ?? selectedVariantImage?.url;
  useEffect(() => {
    setIndex(0);
    setZoomed(false);
  }, [variantImageKey]);

  useEffect(() => {
    setIndex((n) => Math.min(n, Math.max(0, total - 1)));
  }, [total]);

  /*
   * The track is offset in pixels, not percent, so a drag and the settled
   * position share a unit and cannot disagree mid-gesture. The width therefore
   * has to be state: read from a ref alone it is 0 on first paint and stale
   * after a resize or rotation.
   */
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const sync = () => setWidth(node.clientWidth);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Trackpads send a sideways flick as a wheel event. Passive, never
  // prevented: a vertical scroll that drifts sideways keeps scrolling the page.
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
      setZoomed(false);
      setIndex((n) => Math.max(0, Math.min(total - 1, n + step)));
    };
    node.addEventListener('wheel', onWheel, {passive: true});
    return () => node.removeEventListener('wheel', onWheel);
  }, [total]);

  if (count === 0) {
    return (
      <div className="product-gallery">
        <div className="product-image product-image-placeholder" aria-hidden />
      </div>
    );
  }

  /**
   * Native share sheet where the browser has one, clipboard everywhere else.
   * The URL is read at click time rather than from props: the variant picker
   * rewrites the query string, and a shopper sharing a colourway means the
   * colourway they are looking at.
   */
  const onShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      // A dismissed sheet rejects with AbortError — not an error to report.
      try {
        await navigator.share({title, url});
      } catch {
        /* dismissed */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), SHARE_TOAST_MS);
    } catch {
      /* clipboard blocked (insecure context, denied permission) */
    }
  };

  const go = (to: number) => {
    setZoomed(false);
    setIndex(Math.max(0, Math.min(total - 1, to)));
  };

  const onTouchStart = (event: React.TouchEvent) => {
    const point = event.touches[0];
    touch.current = {x: point.clientX, y: point.clientY, axis: 'none'};
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
      // sideways must not start dragging the photos.
      start.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (start.axis === 'x') setDragging(true);
    }
    if (start.axis !== 'x') return;
    // Resist at the ends rather than sliding into blank space.
    const atEdge = (index === 0 && dx > 0) || (index === total - 1 && dx < 0);
    setDragX(atEdge ? dx * 0.25 : dx);
  };

  const onTouchEnd = () => {
    const start = touch.current;
    touch.current = null;
    setDragging(false);
    const travelled = dragX;
    setDragX(0);
    if (start?.axis !== 'x') return;
    if (Math.abs(travelled) < SWIPE_THRESHOLD) return;
    go(index + (travelled < 0 ? 1 : -1));
  };

  /** Point the magnifier at wherever the cursor is, on the photo in view. */
  const focusZoom = (clientX: number, clientY: number) => {
    const frame = viewport.current;
    const layer = zoomLayer.current;
    if (!frame || !layer) return;
    const rect = frame.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    layer.style.transformOrigin = `${Math.max(0, Math.min(100, x))}% ${Math.max(
      0,
      Math.min(100, y),
    )}%`;
  };

  const offset = -index * width + dragX;

  return (
    <div className="product-gallery">
      <div className="pg-main">
        {/* A carousel region that takes arrow keys and a hover magnifier is
            the documented pattern; the rule has no notion of it. */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
        <div
          ref={viewport}
          className={`pg-viewport${zoomed ? ' is-zoomed' : ''}`}
          role="group"
          aria-roledescription="carousel"
          aria-label={`${title} — ${t('Product images')}`}
          // Arrow keys page the photos; Enter / Space toggles the magnifier.
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') {
              event.preventDefault();
              go(index + 1);
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault();
              go(index - 1);
            } else if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              const rect = viewport.current?.getBoundingClientRect();
              if (rect) {
                focusZoom(
                  rect.left + rect.width / 2,
                  rect.top + rect.height / 2,
                );
              }
              setZoomed((current) => !current);
            }
          }}
          // The magnifier is a mouse affordance only: on a touch screen the
          // same gesture space belongs to the swipe.
          onPointerEnter={(event) => {
            if (event.pointerType !== 'mouse') return;
            // Nothing to magnify on the authenticity panel.
            if (index === count) return;
            focusZoom(event.clientX, event.clientY);
            setZoomed(true);
          }}
          onPointerMove={(event) => {
            if (event.pointerType !== 'mouse') return;
            if (index === count) return;
            focusZoom(event.clientX, event.clientY);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType !== 'mouse') return;
            setZoomed(false);
          }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <div
            className="pg-track"
            style={{
              transform: `translate3d(${offset}px, 0, 0)`,
              // No easing while a finger is down: the track must follow the
              // finger exactly, and only glide once it lets go.
              transition: dragging ? 'none' : undefined,
            }}
          >
            {gallery.map((image, position) => (
              <div
                className="product-image pg-slide"
                key={image.id ?? image.url}
                aria-hidden={position !== index}
              >
                <div
                  className="pg-zoom-layer"
                  ref={position === index ? zoomLayer : undefined}
                >
                  <Image
                    alt={image.altText || title}
                    data={image}
                    sizes="(min-width: 60em) 45vw, 100vw"
                    // The first photo is the page's LCP; its neighbours are
                    // fetched ahead so a swipe never lands on a blank frame.
                    loading={Math.abs(position - index) <= 1 ? 'eager' : 'lazy'}
                    fetchPriority={position === 0 ? 'high' : undefined}
                    draggable={false}
                  />
                </div>
              </div>
            ))}

            {/* Last slide on every product: the authenticity guarantee, with
                the product's own photo so it reads as part of the set rather
                than an advert spliced onto the end. */}
            <div
              className="product-image pg-slide pg-authn-slide"
              aria-hidden={index !== count}
            >
              <div className="pg-authn">
                <div className="pg-authn-media">
                  <img src={authnSrc} alt="" loading="lazy" draggable={false} />
                </div>
                <p className="pg-authn-title">
                  <Emphasised text={t('{i}Guaranteed{/i} Real')} />
                </p>
                <p className="pg-authn-copy">
                  <Emphasised
                    text={t(
                      'Each item is carefully checked for {i}authenticity{/i} — 100% genuine guaranteed.',
                    )}
                  />
                </p>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="pg-share"
          onClick={() => {
            void onShare();
          }}
          aria-label={t('Share')}
        >
          <BsShare aria-hidden="true" />
        </button>
        <span className="pg-share-toast" role="status" aria-live="polite">
          {copied ? t('Link copied') : ''}
        </span>

        {total > 1 ? (
          <>
            {/* Mouse-only controls: a pointer has nothing to swipe with. */}
            <button
              type="button"
              className="pg-arrow is-prev"
              aria-label={t('Previous slide')}
              onClick={() => go(index - 1)}
              disabled={index === 0}
            >
              <span aria-hidden="true">←</span>
            </button>
            <button
              type="button"
              className="pg-arrow is-next"
              aria-label={t('Next slide')}
              onClick={() => go(index + 1)}
              disabled={index === total - 1}
            >
              <span aria-hidden="true">→</span>
            </button>

            <div
              className="hero-show-dots pg-dots"
              role="tablist"
              aria-label={t('Product images')}
            >
              {gallery.map((image, dot) => (
                <button
                  key={image.id ?? image.url}
                  type="button"
                  role="tab"
                  aria-selected={dot === index}
                  aria-label={`${dot + 1} / ${total}`}
                  className={`hero-show-dot${dot === index ? ' is-on' : ''}`}
                  onClick={() => go(dot)}
                />
              ))}
              <button
                type="button"
                role="tab"
                aria-selected={index === count}
                aria-label={t('Authenticity guarantee')}
                className={`hero-show-dot${index === count ? ' is-on' : ''}`}
                onClick={() => go(count)}
              />
            </div>
          </>
        ) : null}
      </div>

      {total > 1 && (
        <div
          className="product-thumbs"
          role="group"
          aria-label={t('Product images')}
        >
          {gallery.map((image, i) => (
            <button
              key={image.id ?? image.url}
              type="button"
              className={`product-thumb${i === index ? ' is-active' : ''}`}
              aria-current={i === index}
              aria-label={`${i + 1} / ${count}`}
              onClick={() => go(i)}
            >
              <Image
                data={image}
                alt={image.altText || `${title} ${i + 1}`}
                sizes="72px"
                loading="lazy"
              />
            </button>
          ))}
          <button
            type="button"
            className={`product-thumb pg-thumb-authn${
              index === count ? ' is-active' : ''
            }`}
            aria-current={index === count}
            aria-label={t('Authenticity guarantee')}
            onClick={() => go(count)}
          >
            <BsPatchCheck aria-hidden="true" />
          </button>
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {total > 1 ? `${index + 1} / ${total}` : ''}
      </span>
    </div>
  );
}
