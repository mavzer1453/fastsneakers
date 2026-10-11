/**
 * The hero: worn photography, one frame at a time, with a clip in the middle.
 *
 * Two behaviours, and the price always matches the destination:
 *
 * - `product` links to one listing and quotes ITS price. Used where the photo
 *   is unmistakably one pair.
 * - `collection` links to a whole shelf and quotes "From €x", the cheapest
 *   piece on it. Used where a photo can't pin down a colourway, or where the
 *   shelf is simply the better landing page.
 *
 * The rule that matters: a tile never shows one product's price and then
 * opens somewhere else. Whatever number is on the photo is a number you can
 * actually pay on the page it opens.
 *
 * Editing this list is the whole job: drop a file in `public/hero/`, add an
 * entry. Order matters — the clip is inserted at the midpoint, so the run
 * stays balanced as tiles are added.
 */
export type HeroTile = {
  id: string;
  /** The original JPEG. Still the fallback for a browser with neither format. */
  image: string;
  /**
   * Widths that exist in `app/assets/hero/` as `<name>-<width>.avif` and
   * `.webp`.
   *
   * They live under app/assets, NOT public/, on purpose. Anything in public/
   * is served from fastsneaker.com, and Shopify's image service on
   * that hostname re-encodes AVIF and WebP into JPEG — a 104 KB AVIF went out
   * as a 241 KB JPEG. Files imported through Vite are served from
   * cdn.shopify.com instead, where they arrive byte-for-byte.
   *
   * Regenerate with Pillow after adding or replacing a photo (AVIF quality
   * 50, WebP 70; the carpet in travis-olive is pure noise, so that one is 42
   * and 62). Never list a width larger than the source.
   */
  widths: number[];
  /** Pixel size of the original, so the <img> can reserve its box. */
  width: number;
  height: number;
  label: string;
  kind: 'product' | 'collection';
  /** Exactly one of these, matching `kind`. */
  handle?: string;
  collection?: string;
};

export const HERO_TILES: HeroTile[] = [
  {
    id: 'travis-olive',
    image: '/hero/travis-olive.jpg',
    widths: [480, 720, 960, 1200],
    width: 1440,
    height: 1800,
    label: 'Travis Scott Jordan 1 Low Olive',
    kind: 'product',
    handle: 'nike-air-jordan-1-low-travis-scott-olive',
  },
  {
    id: 'essentials-hoodie',
    image: '/hero/essentials-hoodie-oatmeal.jpg',
    widths: [480, 720],
    width: 735,
    height: 892,
    label: 'Fear of God Essentials',
    kind: 'collection',
    collection: 'essentials',
  },
  {
    id: 'samba-leopard',
    image: '/hero/samba-leopard.jpg',
    widths: [480, 720, 960, 1170],
    width: 1170,
    height: 1544,
    label: 'adidas Samba OG Preloved Red Leopard',
    kind: 'product',
    handle: 'adidas-samba-og-preloved-red-leopard',
  },
  {
    id: 'jacquemus',
    image: '/hero/jacquemus-bambino-white.jpg',
    widths: [480, 720, 960, 1200],
    width: 1200,
    height: 1600,
    label: 'Jacquemus',
    kind: 'collection',
    collection: 'jacquemus',
  },
  {
    id: 'travis-pink',
    image: '/hero/travis-pink.jpg',
    widths: [480, 720, 960, 1080],
    width: 1080,
    height: 1440,
    label: 'Travis Scott Jordan 1 Low Tropical Pink',
    kind: 'product',
    handle: 'jordan-1-retro-low-og-sp-travis-scott-sail-tropical-pink',
  },
  {
    id: 'stussy',
    image: '/hero/stussy-hoodie.jpg',
    widths: [480, 720],
    width: 736,
    height: 981,
    label: 'Stussy',
    kind: 'collection',
    collection: 'stussy',
  },
  {
    id: 'ugg-tazz',
    image: '/hero/ugg-tazz-chestnut.jpg',
    widths: [480, 720, 960, 1080],
    width: 1080,
    height: 1080,
    label: 'UGG',
    kind: 'collection',
    collection: 'ugg-boots-slippers',
  },
];

/**
 * Every generated hero file, keyed by its path, resolved to the URL Vite
 * gives it (hashed, on the asset CDN). Eager and `?url`, so this is a plain
 * string map that is identical in the server and the browser bundle.
 */
const HERO_FILES = import.meta.glob<string>('../assets/hero/*.{avif,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** `srcset` for one format of a tile's photo. */
export function heroSrcSet(tile: HeroTile, format: 'avif' | 'webp'): string {
  const name = tile.image.replace(/^.*\//, '').replace(/\.jpe?g$/i, '');
  return tile.widths
    .map((width) => {
      const url = HERO_FILES[`../assets/hero/${name}-${width}.${format}`];
      return url ? `${url} ${width}w` : null;
    })
    .filter(Boolean)
    .join(', ');
}

/** Muted, looping clip, shown at the midpoint of the run. */
/**
 * 720x1280 H.264, no audio track (it only ever plays muted), CRF 30, and
 * `+faststart` so the index sits at the front of the file and playback can
 * begin from the first bytes — 765 KB against the 1.6 MB original, which is
 * still in public/hero/ as the master.
 *   ffmpeg -i hero-clip.mp4 -an -c:v libx264 -preset slow -crf 30 \
 *     -pix_fmt yuv420p -movflags +faststart hero-clip-720.mp4
 */
export const HERO_VIDEO = '/hero/hero-clip-720.mp4';

/** First frame of the clip, shown until the video itself has data. */
export const HERO_VIDEO_POSTER: string | undefined =
  HERO_FILES['../assets/hero/hero-clip-poster.webp'];

/**
 * What the clip is selling.
 *
 * The video is a slide like any other, so it has to go somewhere when it is
 * tapped — a pane that plays and then does nothing is the one thing on the
 * banner that isn't shoppable. It carries the same label, price and button
 * as a photograph for the same reason.
 *
 * `id` is not a tile id: it only has to be unique inside the price map the
 * loader hands the banner.
 */
export const HERO_VIDEO_PRODUCT = {
  id: 'hero-clip',
  label: 'Travis Scott Jordan 1 Low Black Phantom',
  handle: 'nike-air-jordan-1-low-travis-scott-black-phantom',
};

/** Collection handles that need a floor price looked up. */
export const HERO_TILE_COLLECTIONS = HERO_TILES.map(
  (tile) => tile.collection,
).filter((handle): handle is string => Boolean(handle));

/** Product handles the loader looks prices up for — the clip's included. */
export const HERO_TILE_HANDLES = [
  ...HERO_TILES.map((tile) => tile.handle).filter(
    (handle): handle is string => Boolean(handle),
  ),
  HERO_VIDEO_PRODUCT.handle,
];
