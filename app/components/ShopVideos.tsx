import {useEffect, useRef, useState} from 'react';
import {Link} from 'react-router';

import {ProductsRail} from '~/components/ProductsRail';
import {useLocalizedHref} from '~/lib/localizedLink';
import {useTranslate} from '~/lib/useTranslate';

/**
 * "Watch & shop" on the product page: short vertical clips from the shop's
 * socials, each one a link to the collection it shows. Sits between the
 * product rails and the "Loved by our customers" band, and reuses the
 * product rails' scroller (ProductsRail) so it swipes and pages the same way.
 *
 * Files live in `public/videos/`: `<id>.mp4` is 404x720 H.264 with no audio
 * track (they only ever play muted), CRF 28 and `+faststart` so playback
 * starts from the first bytes — 0.4–1.1 MB each; `<id>.jpg` is the poster
 * (frame at 0.6 s).
 *   ffmpeg -i in.mp4 -an -vf "scale=-2:720:flags=lanczos,format=yuv420p" \
 *     -c:v libx264 -preset slow -crf 28 -movflags +faststart out.mp4
 *
 * Nothing is downloaded until the section is ~300px from the viewport — not
 * even the posters — and a clip only plays while at least half of it is on
 * screen. With reduced motion the posters stay still.
 */
const VIDEOS: Array<{id: string; label: string; to: string}> = [
  {
    id: 'travis-staff-pick',
    label: 'Travis Scott',
    to: '/collections/travis-scott',
  },
  {id: 'essentials-cream', label: 'Essentials', to: '/collections/essentials'},
  {id: 'sneaker-rotation', label: 'Sneakers', to: '/collections/sneakers'},
  {id: 'essentials-duo', label: 'Essentials', to: '/collections/essentials'},
  {
    id: 'orders-on-the-way',
    label: 'Travis Scott',
    to: '/collections/travis-scott',
  },
];

export function ShopVideos() {
  const t = useTranslate();
  const sectionRef = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || near) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      {rootMargin: '300px 0px'},
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [near]);

  return (
    <section
      ref={sectionRef}
      className="pdp-rail shop-videos"
      aria-label={t('Watch & shop')}
    >
      <div className="pdp-rail-head">
        <div>
          <h2>{t('Watch & shop')}</h2>
          <p>{t('Straight from our feed')}</p>
        </div>
      </div>
      <ProductsRail>
        {VIDEOS.map((video) => (
          <div className="products-carousel-item shop-video-item" key={video.id}>
            <ShopVideoCard
              id={video.id}
              label={t(video.label)}
              to={video.to}
              armed={near}
            />
          </div>
        ))}
      </ProductsRail>
    </section>
  );
}

function ShopVideoCard({
  id,
  label,
  to,
  armed,
}: {
  id: string;
  label: string;
  to: string;
  armed: boolean;
}) {
  const t = useTranslate();
  const localize = useLocalizedHref();
  const ref = useRef<HTMLVideoElement>(null);

  // Play only while at least half the clip is on screen.
  useEffect(() => {
    const video = ref.current;
    if (!video || !armed) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void video.play().catch(() => {});
        else video.pause();
      },
      {threshold: 0.5},
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [armed]);

  return (
    <Link className="shop-video" to={localize(to)} prefetch="intent">
      <video
        ref={ref}
        className="shop-video-media"
        src={armed ? `/videos/${id}.mp4` : undefined}
        poster={armed ? `/videos/${id}.jpg` : undefined}
        muted
        loop
        playsInline
        preload={armed ? 'metadata' : 'none'}
        aria-hidden="true"
        tabIndex={-1}
      />
      <span className="shop-video-scrim" aria-hidden="true" />
      <span className="shop-video-copy">
        <strong>{label}</strong>
        <span>
          {t('Shop the collection')} <span aria-hidden="true">→</span>
        </span>
      </span>
    </Link>
  );
}
