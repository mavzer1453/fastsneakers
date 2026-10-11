/**
 * Collabs shown on the homepage, in the order they appear.
 *
 * Images come from MENU_IMAGES (the same set the mobile menu uses), so
 * nothing new has to be hosted and the two surfaces can't drift apart.
 */
export const COLLAB_TILES: Array<{label: string; handle: string}> = [
  {label: 'Travis Scott', handle: 'travis-scott-sneakers'},
  {label: 'Nike x Off-White', handle: 'nike-off-white'},
  {label: 'Nike x sacai', handle: 'nike-sacai'},
  {label: 'Nike x NOCTA', handle: 'nike-nocta'},
  {label: 'Nike x Supreme', handle: 'nike-supreme'},
  {label: 'adidas x Wales Bonner', handle: 'collab-wales-bonner'},
  {label: 'adidas x Bad Bunny', handle: 'collab-bad-bunny'},
  {label: 'Kith', handle: 'collab-kith'},
  {label: 'Palace', handle: 'collab-palace'},
  {label: 'KAWS', handle: 'collab-kaws'},
];

/**
 * Adult sizes, as the collection page's `?size=` filter expects them.
 *
 * Why these eight: the filter takes at most 8 values and ORs them, so this
 * has to be a representative adult run rather than an exhaustive one. Four
 * shoe sizes and three apparel letters cover the adult range on both sides
 * of the catalogue; a collab holding only footwear still matches, and one
 * holding only tees still matches.
 *
 * What it buys: kids product carry `ps` / `td` tags and NO `size:` tags at
 * all, so any size filter drops them. Without it a collab collection opens
 * on a wall of toddler pairs, which is what prompted this.
 *
 * The trade: an adult pair stocked only in, say, 36–39 is filtered out too.
 * The shopper can clear the filter on the page, and the collection link in
 * the footer is unfiltered.
 */
export const ADULT_SIZES = ['40', '41', '42', '43', '44', 'M', 'L', 'XL'];

/** `/collections/<handle>?size=40&size=41…` */
export function collabHref(handle: string): string {
  const params = new URLSearchParams();
  for (const size of ADULT_SIZES) params.append('size', size);
  return `/collections/${handle}?${params.toString()}`;
}

/**
 * Artwork normalisation for the collab cards.
 *
 * The problem: these cut-outs come from a dozen different suppliers and none
 * of them frame a shoe the same way. Measured on the live images, the shoe
 * fills anywhere from 34% of its PNG's height (the Palace x UGG Tasman) to
 * 66% (the NOCTA AF1). Drawing every <img> at the same height therefore drew
 * every *shoe* at a different size — a 2x spread, which is what the row
 * looked like.
 *
 * No amount of `object-fit` can fix that, because CSS has no idea where the
 * ink sits inside a mostly transparent PNG. So the frame is measured once and
 * recorded here.
 *
 *   fill   - the shoe's height as a fraction of the PNG's height
 *   center - the shoe's vertical midpoint as a fraction of the PNG's height
 *            (0.5 would be perfectly centred; most of these sit low)
 *
 * `collabArtVars` turns those into a scale and a nudge so that every shoe
 * ends up COLLAB_ART_FILL of the image box tall and centred on it.
 *
 * To re-measure after swapping an image, run this in the browser console on
 * the homepage (the CDN allows cross-origin reads, so the canvas isn't
 * tainted):
 *
 *   for (const i of document.querySelectorAll('.collab-card-img')) {
 *     const im = new Image(); im.crossOrigin = 'anonymous'; im.src = i.currentSrc;
 *     await im.decode();
 *     const c = document.createElement('canvas');
 *     c.width = im.naturalWidth; c.height = im.naturalHeight;
 *     const x = c.getContext('2d'); x.drawImage(im, 0, 0);
 *     const d = x.getImageData(0, 0, c.width, c.height).data;
 *     let y0 = c.height, y1 = -1;
 *     for (let y = 0; y < c.height; y++)
 *       for (let X = 0; X < c.width; X++)
 *         if (d[(y * c.width + X) * 4 + 3] > 24) { if (y < y0) y0 = y; if (y > y1) y1 = y; break; }
 *     console.log(i.currentSrc, (y1 - y0 + 1) / c.height, ((y0 + y1) / 2) / c.height);
 *   }
 *
 * A handle with no entry here falls back to scale 1 — it just renders as it
 * always did, no worse than before, so a new collab is never broken by a
 * missing measurement.
 */
const COLLAB_ART: Record<
  string,
  {fill: number; center: number; target?: number}
> = {
  'travis-scott-sneakers': {fill: 0.6354, center: 0.5521},
  'nike-off-white': {fill: 0.849, center: 0.4583},
  'nike-sacai': {fill: 0.4224, center: 0.5124},
  'nike-nocta': {fill: 0.6563, center: 0.5521},
  'nike-supreme': {fill: 0.3875, center: 0.5344},
  'collab-wales-bonner': {fill: 0.3438, center: 0.5563},
  'collab-bad-bunny': {fill: 0.4, center: 0.5141},
  'collab-kith': {fill: 0.625, center: 0.5365},
  'collab-palace': {fill: 0.3375, center: 0.5656},
  /*
   * The only tile whose artwork is not a shoe. Normalising a t-shirt to the
   * same silhouette height as a sneaker makes it read as undersized, because
   * a real tee is the taller object — so it gets its own target.
   */
  'collab-kaws': {fill: 0.6, center: 0.4969, target: 0.72},
};

/**
 * How much of the image box the shoe should occupy, after normalisation.
 *
 * 0.54 is chosen so the biggest correction is the Palace UGG at 1.6x. Going
 * higher would give the row more presence but would push the worst-framed
 * cut-outs past 2x, and these are 320px-wide CDN renders — past that they go
 * soft on a retina screen.
 */
const COLLAB_ART_FILL = 0.54;

/** Custom properties for one collab image: `--collab-scale`, `--collab-dy`. */
export function collabArtVars(handle: string): Record<string, string> {
  const art = COLLAB_ART[handle];
  if (!art) return {};
  const scale = (art.target ?? COLLAB_ART_FILL) / art.fill;
  /*
   * The translate is written after the scale in the CSS transform list, so
   * it is applied in the unscaled frame — but the shoe's offset from the box
   * centre grows with the scale, hence the factor here.
   */
  const dy = -scale * (art.center - 0.5) * 100;
  return {
    '--collab-scale': scale.toFixed(3),
    '--collab-dy': `${dy.toFixed(2)}%`,
  };
}

/**
 * The same artwork, at 320px instead of 160px.
 *
 * MENU_IMAGES is sized for the mobile menu's small thumbnails. The collab
 * cards draw the worst-framed shoes at up to 1.6x, which at 160px would be
 * visibly soft, so the size token is rewritten here rather than bloating
 * every menu thumbnail.
 */
export function collabImage(src: string, width = 320): string {
  const [path, query = ''] = src.split('?');
  const base = path.replace(/_\d+x\d+(?=\.[a-z0-9]+$)/i, '');
  const params = new URLSearchParams(query);
  params.set('width', String(width));
  return `${base}?${params.toString()}`;
}
