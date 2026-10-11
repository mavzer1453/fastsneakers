import {SHOP} from '~/data/shop';
import {useCallback, useEffect, useRef, useState} from 'react';
import {ReviewBadge} from '~/components/ReviewBadge';
import {Link} from 'react-router';

import {useLocalizedHref} from '~/lib/localizedLink';
import {useTranslate} from '~/lib/useTranslate';

/**
 * The two social-proof bands, shared by the homepage and the product page.
 *
 * They live here rather than in a route so both pages render the same markup
 * from the same data — a second copy would drift the moment one of them was
 * edited.
 */

/**
 * Customer quotes — real messages from the shop's Instagram customers (owner
 * confirmed 2026-10-01). The rating badge in the band header and the five
 * stars on each card follow `SHOP.reviews.show` (back on 2026-10-08); the
 * quotes themselves follow `showTestimonials`. No "verified buyer" mark.
 * An empty array hides the section entirely.
 */
const REVIEWS: Array<{quote: string; name: string; detail: string}> = [
  {
    quote:
      'Compared my Jordan 1 Low against a pair from an official retailer — stitching, box label, everything checks out. Exactly as described.',
    name: 'Milan V.',
    detail: 'Air Jordan 1 Low',
  },
  {
    quote:
      'Snelle verzending en topkwaliteit. Precies zoals op de foto’s — zeker een aanrader.',
    name: 'Daan K.',
    detail: 'Jordan 1 Low Travis Scott',
  },
  {
    quote:
      'The Essentials hoodie fits exactly like the size guide said, and the fabric weight is the real deal. Tags and packaging all intact.',
    name: 'Sarah D.',
    detail: 'Essentials hoodie',
  },
  {
    quote:
      'Kargo çok hızlıydı, ürün kaliteli ve paketleme özenliydi. Kesinlikle tavsiye ederim.',
    name: 'Zeynep A.',
    detail: 'New Balance 9060',
  },
  {
    quote:
      'Commande reçue en trois jours, qualité au top et suivi impeccable. Je recommande !',
    name: 'Léa M.',
    detail: 'Essentials hoodie',
  },
  {
    quote:
      'Todo perfecto — envío rápido y el producto tal cual las fotos. Repetiré seguro.',
    name: 'Carlos G.',
    detail: 'Air Max 1',
  },
  {
    quote:
      'Asked support about sizing before ordering and got a straight, honest answer instead of a sales pitch. The tracksuit fits perfectly.',
    name: 'Ilias B.',
    detail: 'Syna World tracksuit',
  },
  {
    quote:
      'Makkelijk besteld en snel in huis. De size guide klopte precies, fit is perfect.',
    name: 'Femke J.',
    detail: 'Essentials tracksuit',
  },
  {
    quote:
      'Sorunsuz alışveriş. Ürün fotoğraflardakiyle birebir aynı, kargo takibi de çok iyiydi.',
    name: 'Emre T.',
    detail: 'Dunk Low',
  },
  {
    quote: 'Quick shipping and easy to order. Exactly as described.',
    name: 'Jack W.',
    detail: 'Nike Shox TL',
  },
];

function Stars() {
  const t = useTranslate();
  return (
    <span
      className="review-stars"
      role="img"
      aria-label={t('5 out of 5 stars')}
    >
      {'★★★★★'}
    </span>
  );
}

/** Real customer photos (shared with the shop) shown beside the quotes. */
const CUSTOMER_PHOTOS = [
  '/customers/cust-13.jpg',
  '/customers/cust-17.jpg',
  '/customers/cust-07.jpg',
  '/customers/cust-03.jpg',
  '/customers/cust-15.jpg',
  '/customers/cust-16.jpg',
  '/customers/cust-05.jpg',
  '/customers/cust-06.jpg',
  '/customers/cust-14.jpg',
  '/customers/cust-01.jpg',
];

/**
 * "Loved by our customers" — a full-bleed black story band: every card is
 * a real customer photo with their review overlaid on the scrim, so the
 * proof and the words arrive together.
 */
export function CustomerLove() {
  const t = useTranslate();
  const localize = useLocalizedHref();
  if (!SHOP.reviews.showTestimonials || REVIEWS.length === 0) return null;
  return (
    <section className="stories-band" aria-labelledby="cust-love-h">
      <div className="stories-inner">
        <div className="stories-head">
          <h2 id="cust-love-h">
            {t('Loved by our customers')}
            <span>{t('Real orders, real fits')}</span>
          </h2>
          <ReviewBadge />
          <Link
            className="stories-head-link"
            to={localize('/collections/all')}
            prefetch="intent"
          >
            {t('Shop what they\u2019re wearing')}
            <span className="section-head-link-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        </div>
        {/* Plain scroller on purpose: a measured rail fights the
            stretch-height cards and thrashes on resize. */}
        <div className="stories-rail">
          {REVIEWS.map((review, index) => (
            <figure className="story-card" key={review.name}>
              <img
                src={CUSTOMER_PHOTOS[index % CUSTOMER_PHOTOS.length]}
                alt=""
                width={560}
                height={747}
                loading="lazy"
                decoding="async"
              />
              <span className="story-card-shade" aria-hidden="true" />
              <figcaption>
                {SHOP.reviews.show && <Stars />}
                <blockquote>{review.quote}</blockquote>
                <span className="story-card-by">
                  <strong>{review.name}</strong>
                  <span>{review.detail}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Instagram feed carousel — the shop's own posts, linking to the profile. */
const INSTAGRAM_URL = 'https://www.instagram.com/vespera.collectives/';
const INSTAGRAM_HANDLE = '@vespera.collectives';

/** Source pixel sizes are kept so the browser can reserve the box early. */
const INSTA_TILES: Array<{src: string; width: number; height: number}> = [
  {src: '/ig/ig-pinklaces.jpg', width: 760, height: 830},
  {src: '/ig/ig-asics.jpg', width: 760, height: 956},
  {src: '/ig/ig-onfeet.jpg', width: 760, height: 1358},
  {src: '/ig/ig-9060-knit.jpg', width: 760, height: 950},
  {src: '/ig/ig-stussy.jpg', width: 760, height: 951},
  {src: '/ig/ig-pinkboxes.jpg', width: 760, height: 953},
  {src: '/ig/ig-duo.jpg', width: 900, height: 1129},
  {src: '/ig/ig-travis-trio.jpg', width: 760, height: 865},
  {src: '/ig/ig-essentials.jpg', width: 760, height: 952},
  {src: '/ig/ig-nba.jpg', width: 760, height: 946},
];

function InstaArrow({direction}: {direction: 'left' | 'right'}) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
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

/**
 * "Moments captured with @handle": a two-up carousel of tall tiles on a
 * phone (four / five up on wider screens), round prev/next buttons laid over
 * the photos, and one centred gradient "Follow us" pill underneath.
 *
 * The track is a native scroller, so swipe and trackpad work without any
 * script; the buttons only page it by one tile and hide at either end.
 */
export function InstaStrip() {
  const t = useTranslate();
  const trackRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const sync = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const max = track.scrollWidth - track.clientWidth;
    setAtStart(track.scrollLeft <= 4);
    setAtEnd(track.scrollLeft >= max - 4);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    // The observer's first report does the initial sync, after layout — see
    // the same note in ProductsRail.
    const observer = new ResizeObserver(sync);
    observer.observe(track);
    return () => observer.disconnect();
  }, [sync]);

  const page = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const tile = track.firstElementChild as HTMLElement | null;
    const gap = parseFloat(getComputedStyle(track).columnGap || '0') || 0;
    const step = tile ? tile.getBoundingClientRect().width + gap : 240;
    track.scrollBy({left: step * direction, behavior: 'smooth'});
  };

  return (
    <section className="section insta" aria-labelledby="insta-h">
      {/* The handle stays outside the translated string — it is a proper
          noun, and threading it through the dictionary would mean every
          language file has to be edited if the account is ever renamed. */}
      <h2 id="insta-h" className="insta-title">
        {t('Moments captured with')}{' '}
        <a
          className="insta-handle"
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          {INSTAGRAM_HANDLE}
        </a>
      </h2>

      <div className="insta-carousel">
        <button
          type="button"
          className="insta-arrow is-prev"
          aria-label={t('Previous posts')}
          onClick={() => page(-1)}
          hidden={atStart}
        >
          <InstaArrow direction="left" />
        </button>
        <div className="insta-strip" ref={trackRef} onScroll={sync}>
          {INSTA_TILES.map((tile) => (
            <a
              key={tile.src}
              className="insta-tile"
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('Open our Instagram')}
            >
              <img
                src={tile.src}
                alt=""
                width={tile.width}
                height={tile.height}
                loading="lazy"
                decoding="async"
              />
            </a>
          ))}
        </div>
        <button
          type="button"
          className="insta-arrow is-next"
          aria-label={t('Next posts')}
          onClick={() => page(1)}
          hidden={atEnd}
        >
          <InstaArrow direction="right" />
        </button>
      </div>

      <div className="insta-cta">
        <a
          className="insta-follow"
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('Follow us')} {INSTAGRAM_HANDLE}
        </a>
      </div>
    </section>
  );
}
