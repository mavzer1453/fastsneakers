import {useCallback, useEffect, useRef, useState} from 'react';

/**
 * Horizontal product rail with scroll arrows. The row itself is a plain
 * scroller (so touch and trackpad work natively); the arrows are a desktop
 * affordance that page it one card-width at a time, and hide themselves at
 * each end so they never look clickable when they'd do nothing.
 */
export function ProductsRail({children}: {children: React.ReactNode}) {
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
    // No `sync()` call here: a ResizeObserver reports once as soon as it
    // starts observing, AFTER the browser has laid the page out. Reading
    // scrollWidth straight from this effect instead forced a full
    // synchronous layout of the freshly hydrated page — once per rail, six
    // times on the homepage (PageSpeed: "forced reflow").
    const observer = new ResizeObserver(sync);
    observer.observe(track);
    return () => observer.disconnect();
  }, [sync]);

  const page = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.firstElementChild as HTMLElement | null;
    const step = card ? card.getBoundingClientRect().width + 16 : 320;
    track.scrollBy({left: step * direction, behavior: 'smooth'});
  };

  const scrollable = !atStart || !atEnd;

  return (
    <div className="products-rail">
      {scrollable && !atStart ? (
        <button
          type="button"
          className="products-rail-arrow is-prev"
          aria-label="Scroll left"
          onClick={() => page(-1)}
        >
          <RailArrow direction="left" />
        </button>
      ) : null}
      <div className="products-carousel" ref={trackRef} onScroll={sync}>
        {children}
      </div>
      {scrollable && !atEnd ? (
        <button
          type="button"
          className="products-rail-arrow is-next"
          aria-label="Scroll right"
          onClick={() => page(1)}
        >
          <RailArrow direction="right" />
        </button>
      ) : null}
    </div>
  );
}

function RailArrow({direction}: {direction: 'left' | 'right'}) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
