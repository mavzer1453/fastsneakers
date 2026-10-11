import {brandFromTitle} from '~/lib/brand';

/**
 * Adult sneakers are sold in EU 36–47 only.
 *
 * The catalogue carries variants outside that (35, 35.5, 47.5 and the whole
 * kids scale from 17 up), because the source feeds list every size the shoe
 * was ever made in. Nothing is deleted — these are hidden at the storefront,
 * so the data is intact and the range is one edit away from changing.
 *
 * The floor and ceiling only bite on values `euSize` can read, which is why
 * every notation in the feed has to be parseable: a size the parser misses is
 * a size the range cannot hide.
 */
const MIN_EU = 36;
const MAX_EU = 47;

/**
 * "42.5 EU" → 42.5, "38 2/3 EU" → 38.67, "36.66 EU" → 36.66, "M" → null.
 *
 * The catalogue is a merge of several suppliers and carries five notations:
 *  - plain halves, "42.5 EU" — Nike, New Balance, most brands
 *  - continental thirds written out, "38 2/3 EU" — adidas, Yeezy, Salomon
 *  - the same thirds as decimals, "38.66 EU" — HOKA, the same grid
 *  - halves written as a fraction, "35 1/2 EU" — a handful of adidas listings
 *  - a width or fit marker appended, "35 EU (N)" on Birkenstock and
 *    "38 EU (Breed)" on Timberland, where the length is the number and the
 *    suffix is the last
 *
 * Returning null for anything else is load-bearing: it keeps apparel (S/M/L)
 * and Crocs' ranges ("36-37 EU") out of the numeric paths. But null is also
 * expensive twice over — an unparsed value switches off sorting for the whole
 * product AND slips past the range filter below, which is how a "35 1/2 EU"
 * was showing on a picker whose floor is 36.
 */
export function euSize(value: string): number | null {
  // "35 EU (N)", "38 EU (Breed)" — width, not length. Stripped only when what
  // is left still says EU, because the same shape means something else on
  // apparel: the flared denim is sized "28 (XS)" through "36 (XL)", a waist
  // with its letter size beside it. Stripping that turned a waist 36 into a
  // shoe size, which showed "US 4" on a pair of jeans — and, worse, sent the
  // other four sizes through the 36–47 range filter below, which dropped
  // them. Twelve denim products were offering one size out of five.
  const cleaned = /\beur?\b/i.test(value)
    ? value.replace(/\([^)]*\)\s*$/, '').trim()
    : value.trim();

  // Halves and thirds; no brand here writes any other denominator. The `eu`
  // may lead as well as follow: four products came through the import as
  // "EU 38" rather than "38 EU", and an unreadable size is one the range
  // filter cannot hide and the picker cannot convert or sort.
  const fraction =
    /^(?:eur?\s*)?(\d{1,2})\s+([12])\s*\/\s*([23])\s*(?:eur?)?$/i.exec(cleaned);
  if (fraction) {
    const numerator = Number(fraction[2]);
    const denominator = Number(fraction[3]);
    if (numerator < denominator) {
      return Number(fraction[1]) + numerator / denominator;
    }
  }

  const plain = /^(?:eur?\s*)?(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:eur?)?$/i.exec(
    cleaned,
  );
  if (!plain) return null;
  const size = Number(plain[1].replace(',', '.'));
  return Number.isFinite(size) ? size : null;
}

/**
 * Collapses the notations onto one key, so "38 2/3", "38.66" and "38.67" all
 * find the same chart row. Sixths are the finest step any brand here uses —
 * halves and thirds both land on them exactly.
 */
export function sizeKey(eu: number): string {
  return (Math.round(eu * 6) / 6).toFixed(2);
}

/**
 * Kids footwear runs 17–40 on its own scale, so the adult range must never be
 * applied to it — a GS shoe filtered to 36+ would lose most of its sizes, and
 * a toddler shoe would lose all of them.
 *
 * Matched on the size markers the catalogue puts in the title: TD toddler,
 * PS pre-school, GS grade school and (I) infant, plus the French listings that
 * came through the import as "Enfant" and "Bébé".
 *
 * Three shapes used to slip through, 24 products in all, every one of them a
 * kids' shoe being offered on the adult size scale:
 *  - the marker without brackets — "Air Jordan 4 RM GS 'Canyon Rust'" and
 *    "Nike Force 1 Low EasyOn TD", which is how most of the GS range is named;
 *  - "(Infants)", because `infant\b` will not match the plural;
 *  - "Bébé", because a trailing `\b` needs a word character on one side and
 *    "é" is not one, so the boundary after it never held.
 */
export function isKidsProduct(title: string): boolean {
  return /\((?:td|ps|gs|i)\)|\b(?:td|ps|gs)\b|\b(?:enfant|toddler|infants?|kids?)\b|b[ée]b[ée]/i.test(
    title,
  );
}

/**
 * Drops size values outside EU 36–47 for adult footwear.
 *
 * Three guards, each load-bearing:
 *  - kids products are returned untouched;
 *  - non-numeric values (S, M, L, One Size) are always kept, so this is safe
 *    to call on apparel;
 *  - if filtering would empty the list, the original is returned — a product
 *    with no size to pick is worse than one showing a size you don't stock.
 *
 * `keepValue` preserves the currently selected size even when out of range,
 * so an existing link to ?Maat=35.5+EU still renders a coherent picker
 * instead of a dropdown with nothing selected.
 */
export function limitSizeValues<T extends {name: string}>(
  values: T[],
  productTitle: string,
  keepValue?: (value: T) => boolean,
): T[] {
  if (isKidsProduct(productTitle)) return sortSizeValues(values);

  const kept = values.filter((value) => {
    if (keepValue?.(value)) return true;
    const size = euSize(value.name);
    if (size === null) return true;
    // The top bound is exclusive of the next half size rather than `<= 47`,
    // so adidas' 47 1/3 stays — it is a US 12.5, the same shoe Nike calls a
    // 47, and it was on sale here before the parser learned to read thirds.
    // Nike's 47.5 is still hidden, exactly as before.
    return size >= MIN_EU && size < MAX_EU + 0.5;
  });

  return sortSizeValues(kept.length > 0 ? kept : values);
}

/**
 * Puts numeric sizes in ascending order.
 *
 * Shopify hands option values back in the order they were created, not in the
 * order they should be read, so a size added after the others lands at the end
 * — which is how "36 EU" ended up sitting after "47 EU" in the picker.
 *
 * Only lists where EVERY value is numeric are touched. Apparel runs S / M / L
 * / XL, whose order is meaningful and unrecoverable from the strings, so a
 * single unparseable value makes this leave the list exactly as it found it.
 */
export function sortSizeValues<T extends {name: string}>(values: T[]): T[] {
  const parsed = values.map((value) => ({value, size: euSize(value.name)}));
  if (parsed.some((entry) => entry.size === null)) return values;
  return parsed
    .slice()
    .sort((a, b) => (a.size ?? 0) - (b.size ?? 0))
    .map((entry) => entry.value);
}

/**
 * The scale a shopper reads sizes in: EU (what we stock and ship), US men's /
 * women's and UK men's / women's. UK added 24 Sep 2026 (owner request) — the
 * UK column is not a fixed offset from US (half a size on adidas/New Balance,
 * a full size on Nike), so it is read off each brand's chart like US is.
 */
export type SizeUnit = 'EU' | 'US_M' | 'US_W' | 'UK_M' | 'UK_W';

/** One EU size, in the scales a shopper might read it in. */
export interface SizeScale {
  us: number;
  uk: number;
  /** Foot length in centimetres — the only figure that is a measurement. */
  cm?: number;
}

export interface SneakerSizeRow {
  /** How the size is written on the guide. */
  eu: string;
  /**
   * Kids charts only: the US size as it is actually written, letter and all.
   *
   * A kids US size is one unisex number carrying a scale letter, and the
   * letter is not decoration — a 13C is a pre-schooler and a 13Y does not
   * exist, while 1Y comes straight after 13.5C. Printing the number alone
   * would turn "1Y" into "US 1", which reads as an adult size four sizes
   * below anything this shop sells.
   */
  kidsUs?: string;
  /**
   * Every EU number that resolves to this row, where that isn't just `eu`.
   * adidas needs it: Gazelle and Yeezy list "38 2/3 EU" while Samba lists the
   * supplier's rounded "39 EU", and both are the same shoe.
   */
  match?: number[];
  men: SizeScale;
  /**
   * Women's. Nike publishes a full women's chart, so those rows carry their
   * own UK and foot length; adidas and New Balance publish one chart with a
   * women's US column, so those rows carry `us` alone.
   *
   * Absent on kids charts, where one number serves everyone: children's lasts
   * are not split by gender until the adult range begins.
   */
  women?: {us: number; uk?: number; cm?: number};
}

export interface SizeChart {
  /**
   * Adult unless stated. A kids chart prints one US column instead of two and
   * names the adult chart to hand over to above its top size — see
   * `adultKey`.
   */
  audience?: 'kids';
  /**
   * Kids charts only: the adult chart that takes over where this one stops.
   *
   * Not a nicety. Thirty-three kids listings here carry an adult size run —
   * "New Balance 9060 Reflection (TD)" is offered in EU 36 to 49 — which is a
   * supplier error we cannot fix from this file. But the fallback is also just
   * true: Nike's grade-school chart ends at 7Y because EU 40 is where children's
   * sizing ends and adult sizing begins, so for anything above it the adult
   * chart is the correct answer, not a consolation.
   */
  adultKey?: string;
  key:
    | 'nike'
    | 'adidas'
    | 'new-balance'
    | 'asics'
    | 'vans'
    | 'puma'
    | 'converse'
    | 'ugg'
    | 'saucony'
    | 'on-running'
    | 'crocs'
    | 'standard'
    | 'nike-kids'
    | 'adidas-kids'
    | 'new-balance-kids'
    | 'ugg-kids';
  /** Shown as the section heading on the size guide. */
  label: string;
  /** Brand labels from `brandFromTitle` that this chart covers. */
  brands: string[];
  /** Where each column came from — several, where several were needed. */
  sources: {label: string; url: string}[];
  rows: SneakerSizeRow[];
}

/**
 * Nike, Jordan and everything without a chart of its own.
 *
 *   men's / unisex  https://www.nike.com/gb/size-fit/unisex-footwear-mens-based
 *   women's         https://www.nike.com/gb/size-fit/womens-footwear
 *
 * The US columns are the familiar 1.5-size offset, but UK and foot length are
 * not: EU 39 is UK 6 on the men's chart and UK 5.5 on the women's, and the
 * centimetre figures differ by half a size at the bottom of the range because
 * women's lasts are built differently. Below EU 40 the two UK columns are half
 * a size apart; from EU 40 up they converge. All of that is Nike's, and
 * smoothing any of it would make the chart wrong.
 */
const NIKE_ROWS: SneakerSizeRow[] = [
  {eu: '36', men: {us: 4, uk: 3.5, cm: 23}, women: {us: 5.5, uk: 3, cm: 22.5}},
  {
    eu: '36.5',
    match: [36.5, 36.667],
    men: {us: 4.5, uk: 4, cm: 23.5},
    women: {us: 6, uk: 3.5, cm: 23},
  },
  {
    eu: '37.5',
    match: [37, 37.333, 37.5],
    men: {us: 5, uk: 4.5, cm: 23.5},
    women: {us: 6.5, uk: 4, cm: 23.5},
  },
  {eu: '38', men: {us: 5.5, uk: 5, cm: 24}, women: {us: 7, uk: 4.5, cm: 24}},
  {
    eu: '38.5',
    match: [38.5, 38.667],
    men: {us: 6, uk: 5.5, cm: 24},
    women: {us: 7.5, uk: 5, cm: 24.5},
  },
  {
    eu: '39',
    match: [39, 39.333],
    men: {us: 6.5, uk: 6, cm: 24.5},
    women: {us: 8, uk: 5.5, cm: 25},
  },
  {eu: '40', men: {us: 7, uk: 6, cm: 25}, women: {us: 8.5, uk: 6, cm: 25.5}},
  {
    eu: '40.5',
    match: [40.5, 40.667],
    men: {us: 7.5, uk: 6.5, cm: 25.5},
    women: {us: 9, uk: 6.5, cm: 26},
  },
  {
    eu: '41',
    match: [41, 41.333],
    men: {us: 8, uk: 7, cm: 26},
    women: {us: 9.5, uk: 7, cm: 26.5},
  },
  {
    eu: '42',
    men: {us: 8.5, uk: 7.5, cm: 26.5},
    women: {us: 10, uk: 7.5, cm: 27},
  },
  {
    eu: '42.5',
    match: [42.5, 42.667],
    men: {us: 9, uk: 8, cm: 27},
    women: {us: 10.5, uk: 8, cm: 27.5},
  },
  {
    eu: '43',
    match: [43, 43.333],
    men: {us: 9.5, uk: 8.5, cm: 27.5},
    women: {us: 11, uk: 8.5, cm: 28},
  },
  {eu: '44', men: {us: 10, uk: 9, cm: 28}, women: {us: 11.5, uk: 9, cm: 28.5}},
  {
    eu: '44.5',
    match: [44.5, 44.667],
    men: {us: 10.5, uk: 9.5, cm: 28.5},
    women: {us: 12, uk: 9.5, cm: 29},
  },
  {
    eu: '45',
    match: [45, 45.333],
    men: {us: 11, uk: 10, cm: 29},
    women: {us: 12.5, uk: 10, cm: 29.5},
  },
  {
    eu: '45.5',
    men: {us: 11.5, uk: 10.5, cm: 29.5},
    women: {us: 13, uk: 10.5, cm: 30},
  },
  {
    eu: '46',
    match: [46, 46.667],
    men: {us: 12, uk: 11, cm: 30},
    women: {us: 13.5, uk: 11, cm: 30.5},
  },
  {
    eu: '47',
    match: [47, 47.333],
    men: {us: 12.5, uk: 11.5, cm: 30.5},
    women: {us: 14, uk: 11.5, cm: 31},
  },
];

/**
 * The continental grid: adidas, Yeezy, Salomon and HOKA.
 *
 * Four brands, one chart, because they publish the same numbers. Salomon and
 * HOKA were each checked row by row against adidas before being pointed here,
 * and all three agree on US, UK and foot length across the whole range.
 *
 * The grid steps in thirds — 36 2/3, 37 1/3, 38 2/3 — which is why these
 * brands carry sizes no other brand has. Three notations reach the same row:
 *  - "38 2/3 EU", how adidas, Yeezy and Salomon write it
 *  - "38.66 EU", how HOKA writes the same size
 *  - "39 EU", the Samba feed's rounding of it, always up to the next half
 *
 * Two things that are easy to get wrong here, both differing from Nike:
 *  - US to UK is half a size, not one. A US 10 is a UK 9.5, where a Nike
 *    US 10 is a UK 9.
 *  - men's to women's US is one size, not Nike's one and a half. A US 10
 *    men's is a US 11 women's.
 *
 * Foot lengths are the mondopoint ladder the rest of this file uses, where
 * a US men's size n is (n + 18) cm - the same figures Nike and New Balance
 * publish for the same US size. adidas publishes a shorter column on this
 * grid (22.1, 22.5, 22.9 ... 29.3 at 47 1/3, against 30.5 here) because it
 * quotes bare foot length with no fitting allowance, so it reads about half
 * a size small against every other chart on this page. The column is the
 * grid's, not adidas', and the two disagree by more at the top than the
 * bottom: an adidas shopper measuring their foot should expect to land one
 * row lower here than on adidas.com.
 */
const ADIDAS_ROWS: SneakerSizeRow[] = [
  {eu: '36', men: {us: 4, uk: 3.5, cm: 22}, women: {us: 5}},
  {
    eu: '36 2/3',
    match: [36.5, 36.667, 37],
    men: {us: 4.5, uk: 4, cm: 22.5},
    women: {us: 5.5},
  },
  {
    eu: '37 1/3',
    match: [37.333, 37.5],
    men: {us: 5, uk: 4.5, cm: 23},
    women: {us: 6},
  },
  {eu: '38', men: {us: 5.5, uk: 5, cm: 23.5}, women: {us: 6.5}},
  {
    eu: '38 2/3',
    match: [38.5, 38.667, 39],
    men: {us: 6, uk: 5.5, cm: 24},
    women: {us: 7},
  },
  {
    eu: '39 1/3',
    match: [39.333, 39.5],
    men: {us: 6.5, uk: 6, cm: 24.5},
    women: {us: 7.5},
  },
  {eu: '40', men: {us: 7, uk: 6.5, cm: 25}, women: {us: 8}},
  {
    eu: '40 2/3',
    match: [40.5, 40.667, 41],
    men: {us: 7.5, uk: 7, cm: 25.5},
    women: {us: 8.5},
  },
  {
    eu: '41 1/3',
    match: [41.333, 41.5],
    men: {us: 8, uk: 7.5, cm: 26},
    women: {us: 9},
  },
  {eu: '42', men: {us: 8.5, uk: 8, cm: 26.5}, women: {us: 9.5}},
  {
    eu: '42 2/3',
    match: [42.5, 42.667, 43],
    men: {us: 9, uk: 8.5, cm: 27},
    women: {us: 10},
  },
  {
    eu: '43 1/3',
    match: [43.333, 43.5],
    men: {us: 9.5, uk: 9, cm: 27.5},
    women: {us: 10.5},
  },
  {eu: '44', men: {us: 10, uk: 9.5, cm: 28}, women: {us: 11}},
  {
    eu: '44 2/3',
    match: [44.5, 44.667, 45],
    men: {us: 10.5, uk: 10, cm: 28.5},
    women: {us: 11.5},
  },
  {
    eu: '45 1/3',
    match: [45.333, 45.5],
    men: {us: 11, uk: 10.5, cm: 29},
    women: {us: 12},
  },
  {eu: '46', men: {us: 11.5, uk: 11, cm: 29.5}, women: {us: 12.5}},
  {
    eu: '46 2/3',
    match: [46.5, 46.667, 47],
    men: {us: 12, uk: 11.5, cm: 30},
    women: {us: 13},
  },
  {
    eu: '47 1/3',
    match: [47.333, 47.5],
    men: {us: 12.5, uk: 12, cm: 30.5},
    women: {us: 13.5},
  },
];

/**
 * New Balance.
 *
 * Its EU grid is genuinely its own: 39.5, 41.5 and 46.5 exist here and not on
 * Nike's, and where the two brands share a number they often disagree — a New
 * Balance EU 41.5 is a US 8, the same US size Nike calls EU 41.
 *
 * Like adidas, US to UK is half a size and men's to women's US is one size.
 *
 * Cross-checked against two independent publications of New Balance's chart:
 * Solereview and Kohl's, which agree on every row including foot length.
 */
const NEW_BALANCE_ROWS: SneakerSizeRow[] = [
  {eu: '36', men: {us: 4, uk: 3.5, cm: 22}, women: {us: 5}},
  {eu: '37', men: {us: 4.5, uk: 4, cm: 22.5}, women: {us: 5.5}},
  {
    eu: '37.5',
    match: [37.5, 36.5],
    men: {us: 5, uk: 4.5, cm: 23},
    women: {us: 6},
  },
  {eu: '38', men: {us: 5.5, uk: 5, cm: 23.5}, women: {us: 6.5}},
  {eu: '38.5', men: {us: 6, uk: 5.5, cm: 24}, women: {us: 7}},
  {eu: '39.5', men: {us: 6.5, uk: 6, cm: 24.5}, women: {us: 7.5}},
  {eu: '40', match: [40, 39], men: {us: 7, uk: 6.5, cm: 25}, women: {us: 8}},
  {eu: '40.5', men: {us: 7.5, uk: 7, cm: 25.5}, women: {us: 8.5}},
  {eu: '41.5', men: {us: 8, uk: 7.5, cm: 26}, women: {us: 9}},
  {
    eu: '42',
    match: [42, 41],
    men: {us: 8.5, uk: 8, cm: 26.5},
    women: {us: 9.5},
  },
  {eu: '42.5', men: {us: 9, uk: 8.5, cm: 27}, women: {us: 10}},
  {eu: '43', men: {us: 9.5, uk: 9, cm: 27.5}, women: {us: 10.5}},
  {eu: '44', men: {us: 10, uk: 9.5, cm: 28}, women: {us: 11}},
  {
    eu: '44.5',
    match: [44.5, 43.5],
    men: {us: 10.5, uk: 10, cm: 28.5},
    women: {us: 11.5},
  },
  {eu: '45', men: {us: 11, uk: 10.5, cm: 29}, women: {us: 12}},
  {eu: '45.5', men: {us: 11.5, uk: 11, cm: 29.5}, women: {us: 12.5}},
  {
    eu: '46.5',
    match: [46.5, 46.6],
    men: {us: 12, uk: 11.5, cm: 30},
    women: {us: 13},
  },
  {
    eu: '47',
    match: [47, 46],
    men: {us: 12.5, uk: 12, cm: 30.5},
    women: {us: 13.5},
  },
  {eu: '47.5', men: {us: 13, uk: 12.5, cm: 31}, women: {us: 14}},
];

/**
 * ASICS and Onitsuka Tiger.
 *
 * ASICS runs a grid of its own and it is the single biggest gap this file
 * had: 549 products here, and 28% of their size values — EU 37, 39.5, 41.5,
 * 43.5 and 46.5 — exist on no other brand's chart, so they were showing no
 * US size at all while the rest were being read off Nike's table, which is
 * half a size out on this grid (an ASICS EU 41.5 is the US 8 that Nike calls
 * EU 41).
 *
 * Unlike adidas and New Balance, ASICS uses the familiar one-and-a-half size
 * step from men's to women's US, and a full size between US and UK.
 *
 * Both columns are ASICS' own published men's and women's charts, transcribed
 * independently by Up & Running and Outdoor Equipped; the two agree on every
 * US, UK and EU figure. The 25.25 and 28.25 cm rows are ASICS' own uneven
 * steps, not rounding on our side.
 *
 * Onitsuka Tiger is ASICS and ships on the same grid.
 */
const ASICS_ROWS: SneakerSizeRow[] = [
  {eu: '36', men: {us: 4, uk: 3, cm: 22.5}, women: {us: 5.5, uk: 3.5}},
  {eu: '37', men: {us: 4.5, uk: 3.5, cm: 23}, women: {us: 6, uk: 4}},
  {eu: '37.5', men: {us: 5, uk: 4, cm: 23.5}, women: {us: 6.5, uk: 4.5}},
  {eu: '38', men: {us: 5.5, uk: 4.5, cm: 24}, women: {us: 7, uk: 5}},
  {eu: '39', men: {us: 6, uk: 5, cm: 24.5}, women: {us: 7.5, uk: 5.5}},
  {eu: '39.5', men: {us: 6.5, uk: 5.5, cm: 25}, women: {us: 8, uk: 6}},
  {eu: '40', men: {us: 7, uk: 6, cm: 25.25}, women: {us: 8.5, uk: 6.5}},
  {eu: '40.5', men: {us: 7.5, uk: 6.5, cm: 25.5}, women: {us: 9, uk: 7}},
  {eu: '41.5', men: {us: 8, uk: 7, cm: 26}, women: {us: 9.5, uk: 7.5}},
  {eu: '42', men: {us: 8.5, uk: 7.5, cm: 26.5}, women: {us: 10, uk: 8}},
  {eu: '42.5', men: {us: 9, uk: 8, cm: 27}, women: {us: 10.5, uk: 8.5}},
  {eu: '43.5', men: {us: 9.5, uk: 8.5, cm: 27.5}, women: {us: 11, uk: 9}},
  {eu: '44', men: {us: 10, uk: 9, cm: 28}, women: {us: 11.5, uk: 9.5}},
  {eu: '44.5', men: {us: 10.5, uk: 9.5, cm: 28.25}, women: {us: 12, uk: 10}},
  {eu: '45', men: {us: 11, uk: 10, cm: 28.5}, women: {us: 12.5, uk: 10.5}},
  {eu: '46', men: {us: 11.5, uk: 10.5, cm: 29}, women: {us: 13, uk: 11}},
  {eu: '46.5', men: {us: 12, uk: 11, cm: 29.5}, women: {us: 13.5, uk: 11.5}},
  {eu: '47', men: {us: 12.5, uk: 11.5, cm: 30}, women: {us: 14, uk: 12}},
];

/**
 * Vans.
 *
 * Vans and Puma share a grid that sits a clean half size off Nike's: a Vans
 * EU 41 is a US 8.5 where Nike's EU 41 is a US 8. Reading Vans off the Nike
 * table made 88% of its sizes wrong by exactly that half size, in the
 * direction that sends a shopper a shoe too small.
 *
 * EU 38.5 upward is vans.com's own chart. Below that, and above EU 46, it is
 * Tactics' transcription of the full Vans chart, which agrees with vans.com
 * on every row the two share.
 *
 * Kept apart from Puma despite the two being identical from EU 38 up, because
 * they disagree on the bottom two rows and each brand's feed here carries its
 * own: Vans lists EU 36.5 and calls EU 37 a US 5.5, Puma lists EU 37.5 and
 * calls EU 37 a US 5. One merged table would have to be wrong for one of them.
 */
const VANS_ROWS: SneakerSizeRow[] = [
  {eu: '36', men: {us: 4.5, uk: 3.5, cm: 22.5}, women: {us: 6}},
  {eu: '36.5', men: {us: 5, uk: 4, cm: 23}, women: {us: 6.5}},
  {eu: '37', men: {us: 5.5, uk: 4.5, cm: 23.5}, women: {us: 7}},
  {eu: '38', men: {us: 6, uk: 5, cm: 24}, women: {us: 7.5}},
  {eu: '38.5', men: {us: 6.5, uk: 5.5, cm: 24.5}, women: {us: 8}},
  {eu: '39', men: {us: 7, uk: 6, cm: 25}, women: {us: 8.5}},
  {eu: '40', men: {us: 7.5, uk: 6.5, cm: 25.5}, women: {us: 9}},
  {eu: '40.5', men: {us: 8, uk: 7, cm: 26}, women: {us: 9.5}},
  {eu: '41', men: {us: 8.5, uk: 7.5, cm: 26.5}, women: {us: 10}},
  {eu: '42', men: {us: 9, uk: 8, cm: 27}, women: {us: 10.5}},
  {eu: '42.5', men: {us: 9.5, uk: 8.5, cm: 27.5}, women: {us: 11}},
  {eu: '43', men: {us: 10, uk: 9, cm: 28}, women: {us: 11.5}},
  {eu: '44', men: {us: 10.5, uk: 9.5, cm: 28.5}, women: {us: 12}},
  {eu: '44.5', men: {us: 11, uk: 10, cm: 29}, women: {us: 12.5}},
  {eu: '45', men: {us: 11.5, uk: 10.5, cm: 29.5}, women: {us: 13}},
  {eu: '46', men: {us: 12, uk: 11, cm: 30}, women: {us: 13.5}},
  {eu: '46.5', men: {us: 12.5, uk: 11.5, cm: 30.5}, women: {us: 14}},
  {eu: '47', men: {us: 13, uk: 12, cm: 31}, women: {us: 14.5}},
];

/**
 * Puma.
 *
 * The same grid as Vans from EU 38 up, and the same half-size offset from
 * Nike — 95% of Puma's sizes here were being read off the Nike table and were
 * wrong because of it.
 *
 * Men's rows are Puma's own chart as published by The Sole Story and Kicks
 * Lab, which agree on every row. The three rows below EU 38 come from Puma's
 * women's chart (whose foot lengths line up with the men's chart exactly at
 * EU 38, so the two really are one grid) with the one-and-a-half size step
 * applied — which is where Puma and Vans part company.
 */
const PUMA_ROWS: SneakerSizeRow[] = [
  {eu: '36', men: {us: 4.5, uk: 3.5, cm: 22.5}, women: {us: 6}},
  {eu: '37', men: {us: 5, uk: 4, cm: 23}, women: {us: 6.5}},
  {eu: '37.5', men: {us: 5.5, uk: 4.5, cm: 23.5}, women: {us: 7}},
  {eu: '38', men: {us: 6, uk: 5, cm: 24}, women: {us: 7.5}},
  {eu: '38.5', men: {us: 6.5, uk: 5.5, cm: 24.5}, women: {us: 8}},
  {eu: '39', men: {us: 7, uk: 6, cm: 25}, women: {us: 8.5}},
  {eu: '40', men: {us: 7.5, uk: 6.5, cm: 25.5}, women: {us: 9}},
  {eu: '40.5', men: {us: 8, uk: 7, cm: 26}, women: {us: 9.5}},
  {eu: '41', men: {us: 8.5, uk: 7.5, cm: 26.5}, women: {us: 10}},
  {eu: '42', men: {us: 9, uk: 8, cm: 27}, women: {us: 10.5}},
  {eu: '42.5', men: {us: 9.5, uk: 8.5, cm: 27.5}, women: {us: 11}},
  {eu: '43', men: {us: 10, uk: 9, cm: 28}, women: {us: 11.5}},
  {eu: '44', men: {us: 10.5, uk: 9.5, cm: 28.5}, women: {us: 12}},
  {eu: '44.5', men: {us: 11, uk: 10, cm: 29}, women: {us: 12.5}},
  {eu: '45', men: {us: 11.5, uk: 10.5, cm: 29.5}, women: {us: 13}},
  {eu: '46', men: {us: 12, uk: 11, cm: 30}, women: {us: 13.5}},
  {eu: '46.5', men: {us: 12.5, uk: 11.5, cm: 30.5}, women: {us: 14}},
  {eu: '47', men: {us: 13, uk: 12, cm: 31}, women: {us: 14.5}},
];

/**
 * Converse.
 *
 * Every column straight off converse.com's own chart, including two quirks
 * nobody expects and no other chart on this page shares.
 *
 * Converse steps men's to women's by TWO sizes. A Converse men's 7 is a
 * women's 9, where every other brand here would make it an 8 or an 8.5. This
 * is not a transcription slip: converse.com prints the two columns side by
 * side, and RunRepeat states the two-size rule outright. A US retailer chart
 * checked against both (Hibbett) shows the generic one-and-a-half step and a
 * UK column a full size below US men's — it is a generic table with Converse's
 * name on it, and it is wrong on both counts.
 *
 * And Converse UK and US men's are the same number. A Converse US 9 is a
 * UK 9, not the UK 8 or 8.5 every other brand on this page would make it.
 *
 * Its EU grid is its own too — EU 41 is a US 7.5 here and a US 8 on Nike's —
 * which is why a quarter of Converse sizes were wrong on the old fallback.
 *
 * The repeated 24.5 cm at EU 38 and 39 is Converse's own figure, not a typo
 * on our side. Converse also runs large across the board — worth knowing,
 * though the size guide no longer prints a note per chart.
 */
const CONVERSE_ROWS: SneakerSizeRow[] = [
  {eu: '36', men: {us: 3.5, uk: 3.5, cm: 22.5}, women: {us: 5.5}},
  {eu: '36.5', men: {us: 4, uk: 4, cm: 23}, women: {us: 6}},
  {eu: '37', men: {us: 4.5, uk: 4.5, cm: 23.5}, women: {us: 6.5}},
  {eu: '37.5', men: {us: 5, uk: 5, cm: 24}, women: {us: 7}},
  {eu: '38', men: {us: 5.5, uk: 5.5, cm: 24.5}, women: {us: 7.5}},
  {eu: '39', match: [39, 38.5], men: {us: 6, uk: 6, cm: 24.5}, women: {us: 8}},
  {eu: '39.5', men: {us: 6.5, uk: 6.5, cm: 25}, women: {us: 8.5}},
  {eu: '40', men: {us: 7, uk: 7, cm: 25.5}, women: {us: 9}},
  {
    eu: '41',
    match: [41, 40.5],
    men: {us: 7.5, uk: 7.5, cm: 26},
    women: {us: 9.5},
  },
  {eu: '41.5', men: {us: 8, uk: 8, cm: 26.5}, women: {us: 10}},
  {eu: '42', men: {us: 8.5, uk: 8.5, cm: 27}, women: {us: 10.5}},
  {eu: '42.5', men: {us: 9, uk: 9, cm: 27.5}, women: {us: 11}},
  {eu: '43', men: {us: 9.5, uk: 9.5, cm: 28}, women: {us: 11.5}},
  {eu: '44', men: {us: 10, uk: 10, cm: 28.5}, women: {us: 12}},
  {eu: '44.5', men: {us: 10.5, uk: 10.5, cm: 29}, women: {us: 12.5}},
  {eu: '45', men: {us: 11, uk: 11, cm: 29.5}, women: {us: 13}},
  {
    eu: '46',
    match: [46, 45.5],
    men: {us: 11.5, uk: 11.5, cm: 30},
    women: {us: 13.5},
  },
  {eu: '46.5', men: {us: 12, uk: 12, cm: 30.5}, women: {us: 14}},
];

/**
 * UGG.
 *
 * UGG steps men's to women's by one size, not one and a half, which is the
 * whole reason this chart exists: on the generic table 72% of UGG sizes came
 * out half a size wrong, and always in the same direction.
 *
 * Columns are UGG's own all-gender chart, the one place UGG publishes men's
 * and women's US against the same EU number.
 *
 * Two rows are paired because UGG's scale skips a step where the feed does
 * not. UGG's chart jumps EU 38.5 straight to 39.5, and EU 41 to 42, but the
 * supplier lists a continuous half-size ladder, so 51 of the 79 UGG products
 * here carry both 39 and 39.5 as separate sizes. Both land on one row, at the
 * larger of the two, which is the advice the rest of this page gives for
 * anyone between sizes.
 *
 * EU 45 and 46 appear on three products each and are left unmapped: UGG's
 * chart goes 44.5 to 45.5 to 47, and there is no honest way to place them.
 *
 * A caveat worth surfacing somewhere if the guide ever regains room for it:
 * UGG's Classic boots are sold in
 * whole EU sizes on a scale of their own (36, 37, 38 ... = US women's 5, 6,
 * 7 ...) which does not line up with the half-size chart below. Foot length
 * is the reliable column for UGG.
 */
const UGG_ROWS: SneakerSizeRow[] = [
  {eu: '36', men: {us: 4, uk: 3, cm: 22}, women: {us: 5}},
  {eu: '36.5', men: {us: 4.5, uk: 3.5, cm: 22.5}, women: {us: 5.5}},
  {eu: '37', men: {us: 5, uk: 4, cm: 23}, women: {us: 6}},
  {eu: '37.5', men: {us: 5.5, uk: 4.5, cm: 23.5}, women: {us: 6.5}},
  {eu: '38', men: {us: 6, uk: 5, cm: 24}, women: {us: 7}},
  {eu: '38.5', men: {us: 6.5, uk: 5.5, cm: 24.5}, women: {us: 7.5}},
  {
    eu: '39 & 39.5',
    match: [39, 39.5],
    men: {us: 7, uk: 6, cm: 25},
    women: {us: 8},
  },
  {eu: '40', men: {us: 7.5, uk: 6.5, cm: 25.5}, women: {us: 8.5}},
  {eu: '40.5', men: {us: 8, uk: 7, cm: 26}, women: {us: 9}},
  {eu: '41', men: {us: 8.5, uk: 7.5, cm: 26.5}, women: {us: 9.5}},
  {
    eu: '41.5 & 42',
    match: [41.5, 42],
    men: {us: 9, uk: 8, cm: 27},
    women: {us: 10},
  },
  {eu: '42.5', men: {us: 9.5, uk: 8.5, cm: 27.5}, women: {us: 10.5}},
  {eu: '43', men: {us: 10, uk: 9, cm: 28}, women: {us: 11}},
  {eu: '43.5', men: {us: 10.5, uk: 9.5, cm: 28.5}, women: {us: 11.5}},
  {eu: '44', men: {us: 11, uk: 10, cm: 29}, women: {us: 12}},
  {eu: '44.5', men: {us: 11.5, uk: 10.5, cm: 29.5}, women: {us: 12.5}},
  {
    eu: '45 & 45.5',
    match: [45, 45.5],
    men: {us: 12, uk: 11, cm: 30},
    women: {us: 13},
  },
  {eu: '47', men: {us: 13, uk: 12, cm: 31}, women: {us: 14}},
];

/**
 * Saucony.
 *
 * Saucony's own men's and women's charts. Its grid matches Nike's through the
 * middle and parts from it at both ends: EU 37 rather than 36.5 at the bottom,
 * and EU 46 is a US 11.5 where Nike's EU 46 is a US 12.
 *
 * US to UK is a full size, as on the ASICS chart, not the half Nike uses.
 */
const SAUCONY_ROWS: SneakerSizeRow[] = [
  {eu: '36', men: {us: 4, uk: 3, cm: 22}, women: {us: 5.5}},
  {eu: '37', men: {us: 4.5, uk: 3.5, cm: 22.5}, women: {us: 6}},
  {eu: '37.5', men: {us: 5, uk: 4, cm: 23}, women: {us: 6.5}},
  {eu: '38', men: {us: 5.5, uk: 4.5, cm: 23.5}, women: {us: 7}},
  {eu: '38.5', men: {us: 6, uk: 5, cm: 24}, women: {us: 7.5}},
  {eu: '39', men: {us: 6.5, uk: 5.5, cm: 24.5}, women: {us: 8}},
  {eu: '40', men: {us: 7, uk: 6, cm: 25}, women: {us: 8.5}},
  {eu: '40.5', men: {us: 7.5, uk: 6.5, cm: 25.5}, women: {us: 9}},
  {eu: '41', men: {us: 8, uk: 7, cm: 26}, women: {us: 9.5}},
  {eu: '42', men: {us: 8.5, uk: 7.5, cm: 26.5}, women: {us: 10}},
  {eu: '42.5', men: {us: 9, uk: 8, cm: 27}, women: {us: 10.5}},
  {eu: '43', men: {us: 9.5, uk: 8.5, cm: 27.5}, women: {us: 11}},
  {eu: '44', men: {us: 10, uk: 9, cm: 28}, women: {us: 11.5}},
  {eu: '44.5', men: {us: 10.5, uk: 9.5, cm: 28.5}, women: {us: 12}},
  {eu: '45', men: {us: 11, uk: 10, cm: 29}, women: {us: 12.5}},
  {eu: '46', men: {us: 11.5, uk: 10.5, cm: 29.5}, women: {us: 13}},
  {eu: '46.5', men: {us: 12, uk: 11, cm: 30}, women: {us: 13.5}},
  {eu: '47', men: {us: 12.5, uk: 11.5, cm: 30.5}, women: {us: 14}},
];

/**
 * On Running.
 *
 * Men's EU 40 and up is On's published men's chart. EU 36 to 39 is On's
 * published women's chart, which is where On numbers the small end, with the
 * men's figure derived from it.
 *
 * Like adidas, New Balance and HOKA, On steps men's to women's by one size,
 * not one and a half. Reading On's two charts side by side suggests one and a
 * half, but that is an illusion created by On labelling the same shoe with
 * different EU numbers on each chart: On's men's EU 40 and women's EU 39 are
 * both 25 cm. Matched on foot length — the only thing that does not move —
 * the step is one size, which is also what RunRepeat's millimetre comparison
 * gives (270 mm is a men's US 9 and 230 mm a women's US 6, and 230 mm is a
 * men's US 5).
 *
 * That is why EU 39 and EU 40 carry the same numbers here. They are the same
 * shoe under two of On's own labels, not a mistake.
 */
const ON_RUNNING_ROWS: SneakerSizeRow[] = [
  {eu: '36', men: {us: 4, uk: 3.5, cm: 22}, women: {us: 5}},
  {eu: '36.5', men: {us: 4.5, uk: 4, cm: 22.5}, women: {us: 5.5}},
  {eu: '37', men: {us: 5, uk: 4.5, cm: 23}, women: {us: 6}},
  {eu: '37.5', men: {us: 5.5, uk: 5, cm: 23.5}, women: {us: 6.5}},
  {eu: '38', men: {us: 6, uk: 5.5, cm: 24}, women: {us: 7}},
  {eu: '38.5', men: {us: 6.5, uk: 6, cm: 24.5}, women: {us: 7.5}},
  {eu: '39', men: {us: 7, uk: 6.5, cm: 25}, women: {us: 8}},
  {eu: '40', men: {us: 7, uk: 6.5, cm: 25}, women: {us: 8}},
  {eu: '40.5', men: {us: 7.5, uk: 7, cm: 25.5}, women: {us: 8.5}},
  {eu: '41', men: {us: 8, uk: 7.5, cm: 26}, women: {us: 9}},
  {eu: '42', men: {us: 8.5, uk: 8, cm: 26.5}, women: {us: 9.5}},
  {eu: '42.5', men: {us: 9, uk: 8.5, cm: 27}, women: {us: 10}},
  {eu: '43', men: {us: 9.5, uk: 9, cm: 27.5}, women: {us: 10.5}},
  {eu: '44', men: {us: 10, uk: 9.5, cm: 28}, women: {us: 11}},
  {eu: '44.5', men: {us: 10.5, uk: 10, cm: 28.5}, women: {us: 11.5}},
  {eu: '45', men: {us: 11, uk: 10.5, cm: 29}, women: {us: 12}},
  {eu: '46', men: {us: 11.5, uk: 11, cm: 29.5}, women: {us: 12.5}},
  {eu: '47', men: {us: 12, uk: 11.5, cm: 30}, women: {us: 13}},
];

/**
 * Crocs.
 *
 * Crocs sells in paired EU ranges — "36-37 EU" is one size, not two — and the
 * number moulded into the sole is the US one, so these 43 products are the
 * case where the US column matters most. They were showing nothing at all,
 * because `euSize` reads a range as unparseable.
 *
 * Two independent publications of Crocs' chart agree on every row, including
 * the gaps: there is no 40-41 and no 44-45, the ladder really does jump from
 * 39-40 to 41-42 and from 43-44 to 45-46.
 *
 * Like Converse, and unlike almost everything else here, Crocs steps men's to
 * women's by two full sizes: an M8 and a W10 are the same clog.
 */
const CROCS_ROWS: SneakerSizeRow[] = [
  {
    eu: '36-37',
    match: [36, 36.5, 37],
    men: {us: 4, uk: 3.5, cm: 22},
    women: {us: 6},
  },
  {
    eu: '37-38',
    match: [37.5, 38],
    men: {us: 5, uk: 4.5, cm: 23},
    women: {us: 7},
  },
  {
    eu: '38-39',
    match: [38.5, 39],
    men: {us: 6, uk: 5.5, cm: 24},
    women: {us: 8},
  },
  {
    eu: '39-40',
    match: [39.5, 40],
    men: {us: 7, uk: 6.5, cm: 25},
    women: {us: 9},
  },
  {
    eu: '41-42',
    match: [40.5, 41, 41.5, 42],
    men: {us: 8, uk: 7.5, cm: 26},
    women: {us: 10},
  },
  {
    eu: '42-43',
    match: [42.5, 43],
    men: {us: 9, uk: 8.5, cm: 27},
    women: {us: 11},
  },
  {
    eu: '43-44',
    match: [43.5, 44],
    men: {us: 10, uk: 9.5, cm: 28},
    women: {us: 12},
  },
  {
    eu: '45-46',
    match: [44.5, 45, 45.5, 46],
    men: {us: 11, uk: 10, cm: 29},
    women: {us: 13},
  },
  {
    eu: '46-47',
    match: [46.5, 47],
    men: {us: 12, uk: 11, cm: 30},
    women: {us: 14},
  },
  {
    eu: '48-49',
    match: [47.5, 48, 49],
    men: {us: 13, uk: 12, cm: 31},
    women: {us: 15},
  },
];

/**
 * The fallback, for every brand with no chart of its own — Puma, Vans,
 * Converse, Saucony, UGG, On Running, Reebok, Under Armour and the long tail.
 *
 * This used to be Nike's chart, which left five EU numbers with no conversion
 * at all: 37, 39.5, 41.5, 43.5 and 46.5 are absent from Nike's grid but very
 * much present in these brands' feeds — a fifth of every Converse and UGG
 * size on the site rendered blank. So the chart is Nike's rows plus those
 * five, and lives apart from NIKE_ROWS precisely so Nike's own table stays
 * exactly what Nike publishes, with nothing interpolated into it.
 *
 * Every figure here is a published number, not an invention. The five added
 * rows are the consensus of the brands that actually use those EU numbers —
 * ASICS, Converse and New Balance all put EU 37 at US 4.5, EU 39.5 at 6.5,
 * EU 41.5 at 8, EU 43.5 at 9.5 and EU 46.5 at 12 — and on three of the five
 * (41.5, 43.5, 46.5) Nike's neighbouring row agrees to the digit.
 *
 * Duplicated US values down the column are the point, not a mistake: EU 41
 * and EU 41.5 are both a US 8 because two brands number the same shoe
 * differently. Merging the grids is what stops a size rendering blank.
 *
 * Two brands are known to sit half a size off this table: Puma and Vans both
 * call EU 41 a US 8.5 where this says 8. Neither is big enough here (43 and
 * 37 products) to earn a chart, and the page says out loud that this one is
 * an approximation.
 */
const STANDARD_ROWS: SneakerSizeRow[] = [
  {eu: '36', men: {us: 4, uk: 3.5, cm: 23}, women: {us: 5.5}},
  {eu: '36.5', men: {us: 4.5, uk: 4, cm: 23.5}, women: {us: 6}},
  {eu: '37', men: {us: 4.5, uk: 4, cm: 23.5}, women: {us: 6}},
  {eu: '37.5', men: {us: 5, uk: 4.5, cm: 23.5}, women: {us: 6.5}},
  {eu: '38', men: {us: 5.5, uk: 5, cm: 24}, women: {us: 7}},
  {eu: '38.5', men: {us: 6, uk: 5.5, cm: 24}, women: {us: 7.5}},
  {eu: '39', men: {us: 6.5, uk: 6, cm: 24.5}, women: {us: 8}},
  {eu: '39.5', men: {us: 6.5, uk: 6, cm: 25}, women: {us: 8}},
  {eu: '40', men: {us: 7, uk: 6, cm: 25}, women: {us: 8.5}},
  {eu: '40.5', men: {us: 7.5, uk: 6.5, cm: 25.5}, women: {us: 9}},
  {eu: '41', men: {us: 8, uk: 7, cm: 26}, women: {us: 9.5}},
  {eu: '41.5', men: {us: 8, uk: 7, cm: 26}, women: {us: 9.5}},
  {eu: '42', men: {us: 8.5, uk: 7.5, cm: 26.5}, women: {us: 10}},
  {eu: '42.5', men: {us: 9, uk: 8, cm: 27}, women: {us: 10.5}},
  {eu: '43', men: {us: 9.5, uk: 8.5, cm: 27.5}, women: {us: 11}},
  {eu: '43.5', men: {us: 9.5, uk: 8.5, cm: 27.5}, women: {us: 11}},
  {eu: '44', men: {us: 10, uk: 9, cm: 28}, women: {us: 11.5}},
  {eu: '44.5', men: {us: 10.5, uk: 9.5, cm: 28.5}, women: {us: 12}},
  {eu: '45', men: {us: 11, uk: 10, cm: 29}, women: {us: 12.5}},
  {eu: '45.5', men: {us: 11.5, uk: 10.5, cm: 29.5}, women: {us: 13}},
  {eu: '46', men: {us: 12, uk: 11, cm: 30}, women: {us: 13.5}},
  {eu: '46.5', men: {us: 12, uk: 11, cm: 30}, women: {us: 13.5}},
  {eu: '47', men: {us: 12.5, uk: 11.5, cm: 30.5}, women: {us: 14}},
];

/**
 * Nike and Jordan kids: toddler, pre-school and grade school on one ladder.
 *
 * 513 products, and until now every one of them showed no US size at all —
 * the picker suppressed the switcher on kids products because there was
 * nothing behind it.
 *
 * Nike splits this across three published charts (TD EU 16–27, PS 27.5–35,
 * GS 35.5–40) but the EU ladder runs straight through, so it is one table
 * here. The EU values match the catalogue's kids listings exactly, which is
 * the strongest check available: the Travis Scott TD run is 17, 18.5, 19.5,
 * 21, 22, 23.5, 25, 26, 27 and every one of those is a row below.
 *
 * `men.us` here is a sort key, not a size. The printed scale restarts — 1Y
 * comes directly after 13.5C — so the bare number runs backwards halfway down
 * the table and would break both the ordering and the monotonic check. The key
 * continues the ladder instead, putting Y sizes 13 above their printed number,
 * so 13.5C is 13.5 and 1Y is 14. The figure anyone reads is `kidsUs`.
 */
const NIKE_KIDS_ROWS: SneakerSizeRow[] = [
  {eu: '16', kidsUs: '1C', men: {us: 1, uk: 0.5, cm: 7}},
  {eu: '16.5', kidsUs: '1.5C', men: {us: 1.5, uk: 1, cm: 7.5}},
  {eu: '17', kidsUs: '2C', men: {us: 2, uk: 1.5, cm: 8}},
  {eu: '18', kidsUs: '2.5C', men: {us: 2.5, uk: 2, cm: 8.5}},
  {eu: '18.5', kidsUs: '3C', men: {us: 3, uk: 2.5, cm: 9}},
  {eu: '19', kidsUs: '3.5C', men: {us: 3.5, uk: 3, cm: 9.5}},
  {eu: '19.5', kidsUs: '4C', men: {us: 4, uk: 3.5, cm: 10}},
  {eu: '20', kidsUs: '4.5C', men: {us: 4.5, uk: 4, cm: 10.5}},
  {eu: '21', kidsUs: '5C', men: {us: 5, uk: 4.5, cm: 11}},
  {eu: '21.5', kidsUs: '5.5C', men: {us: 5.5, uk: 5, cm: 11.5}},
  {eu: '22', kidsUs: '6C', men: {us: 6, uk: 5.5, cm: 12}},
  {eu: '22.5', kidsUs: '6.5C', men: {us: 6.5, uk: 6, cm: 12.5}},
  {eu: '23.5', kidsUs: '7C', men: {us: 7, uk: 6.5, cm: 13}},
  {eu: '24', kidsUs: '7.5C', men: {us: 7.5, uk: 7, cm: 13.5}},
  {eu: '25', kidsUs: '8C', men: {us: 8, uk: 7.5, cm: 14}},
  {eu: '25.5', kidsUs: '8.5C', men: {us: 8.5, uk: 8, cm: 14.5}},
  {eu: '26', kidsUs: '9C', men: {us: 9, uk: 8.5, cm: 15}},
  {eu: '26.5', kidsUs: '9.5C', men: {us: 9.5, uk: 9, cm: 15.5}},
  {eu: '27', kidsUs: '10C', men: {us: 10, uk: 9.5, cm: 16}},
  {eu: '27.5', kidsUs: '10.5C', men: {us: 10.5, uk: 10, cm: 16.5}},
  {eu: '28', kidsUs: '11C', men: {us: 11, uk: 10.5, cm: 17}},
  {eu: '28.5', kidsUs: '11.5C', men: {us: 11.5, uk: 11, cm: 17.5}},
  {eu: '29.5', kidsUs: '12C', men: {us: 12, uk: 11.5, cm: 18}},
  {eu: '30', kidsUs: '12.5C', men: {us: 12.5, uk: 12, cm: 18.5}},
  {eu: '31', kidsUs: '13C', men: {us: 13, uk: 12.5, cm: 19}},
  {eu: '31.5', kidsUs: '13.5C', men: {us: 13.5, uk: 13, cm: 19.5}},
  {eu: '32', kidsUs: '1Y', men: {us: 14, uk: 13.5, cm: 20}},
  {eu: '33', kidsUs: '1.5Y', men: {us: 14.5, uk: 1, cm: 20.5}},
  {eu: '33.5', kidsUs: '2Y', men: {us: 15, uk: 1.5, cm: 21}},
  {eu: '34', kidsUs: '2.5Y', men: {us: 15.5, uk: 2, cm: 21.5}},
  {eu: '35', match: [35, 34.5], kidsUs: '3Y', men: {us: 16, uk: 2.5, cm: 22}},
  {eu: '35.5', kidsUs: '3.5Y', men: {us: 16.5, uk: 3, cm: 22}},
  {eu: '36', kidsUs: '4Y', men: {us: 17, uk: 3.5, cm: 22.5}},
  {eu: '36.5', kidsUs: '4.5Y', men: {us: 17.5, uk: 4, cm: 23}},
  {eu: '37.5', kidsUs: '5Y', men: {us: 18, uk: 4.5, cm: 23.5}},
  {eu: '38', kidsUs: '5.5Y', men: {us: 18.5, uk: 5, cm: 24}},
  {eu: '38.5', kidsUs: '6Y', men: {us: 19, uk: 5.5, cm: 24.5}},
  {eu: '39', kidsUs: '6.5Y', men: {us: 19.5, uk: 6, cm: 25}},
  {eu: '40', match: [40, 39.5], kidsUs: '7Y', men: {us: 20, uk: 6.5, cm: 25.5}},
];

/**
 * adidas, Yeezy, Salomon and HOKA kids, from adidas' own chart.
 *
 * adidas writes the small scale with a k ("10.5k") where Nike writes C; the
 * letter is normalised to K here so the two charts read alike. From 1Y up the
 * two brands agree on every row, and below that they differ only across
 * EU 28–30, where adidas numbers half a size lower than Nike.
 *
 * Stops at EU 36 / 4Y, where adidas' youth chart crosses into the thirds grid
 * the adult table already covers.
 */
const ADIDAS_KIDS_ROWS: SneakerSizeRow[] = [
  {eu: '16', kidsUs: '1K', men: {us: 1, uk: 0, cm: 8.1}},
  {eu: '17', kidsUs: '2K', men: {us: 2, uk: 1, cm: 9}},
  {eu: '18', kidsUs: '3K', men: {us: 3, uk: 2, cm: 9.8}},
  {eu: '19', kidsUs: '4K', men: {us: 4, uk: 3, cm: 10.6}},
  {eu: '20', kidsUs: '5K', men: {us: 5, uk: 4, cm: 11.5}},
  {eu: '21', kidsUs: '5.5K', men: {us: 5.5, uk: 5, cm: 12.3}},
  {eu: '22', kidsUs: '6K', men: {us: 6, uk: 5.5, cm: 12.8}},
  {eu: '23', kidsUs: '6.5K', men: {us: 6.5, uk: 6, cm: 13.2}},
  {eu: '23.5', kidsUs: '7K', men: {us: 7, uk: 6.5, cm: 13.6}},
  {eu: '24', kidsUs: '7.5K', men: {us: 7.5, uk: 7, cm: 14}},
  {eu: '25', kidsUs: '8K', men: {us: 8, uk: 7.5, cm: 14.5}},
  {eu: '25.5', kidsUs: '8.5K', men: {us: 8.5, uk: 8, cm: 14.9}},
  {eu: '26', kidsUs: '9K', men: {us: 9, uk: 8.5, cm: 15.3}},
  {eu: '26.5', kidsUs: '9.5K', men: {us: 9.5, uk: 9, cm: 15.7}},
  {eu: '27', kidsUs: '10K', men: {us: 10, uk: 9.5, cm: 16.1}},
  {eu: '28', kidsUs: '10.5K', men: {us: 10.5, uk: 10, cm: 16.6}},
  {eu: '28.5', kidsUs: '11K', men: {us: 11, uk: 10.5, cm: 17}},
  {eu: '29', kidsUs: '11.5K', men: {us: 11.5, uk: 11, cm: 17.4}},
  {eu: '30', kidsUs: '12K', men: {us: 12, uk: 11.5, cm: 17.8}},
  {eu: '30.5', kidsUs: '12.5K', men: {us: 12.5, uk: 12, cm: 18.3}},
  {eu: '31', kidsUs: '13K', men: {us: 13, uk: 12.5, cm: 18.7}},
  {eu: '31.5', kidsUs: '13.5K', men: {us: 13.5, uk: 13, cm: 19.1}},
  {eu: '32', kidsUs: '1Y', men: {us: 14, uk: 13.5, cm: 19.5}},
  {eu: '33', kidsUs: '1.5Y', men: {us: 14.5, uk: 1, cm: 20}},
  {eu: '33.5', kidsUs: '2Y', men: {us: 15, uk: 1.5, cm: 20.4}},
  {eu: '34', kidsUs: '2.5Y', men: {us: 15.5, uk: 2, cm: 20.8}},
  {eu: '35', kidsUs: '3Y', men: {us: 16, uk: 2.5, cm: 21.2}},
  {eu: '35.5', kidsUs: '3.5Y', men: {us: 16.5, uk: 3, cm: 21.6}},
  {eu: '36', kidsUs: '4Y', men: {us: 17, uk: 3.5, cm: 22.1}},
];

/**
 * New Balance kids.
 *
 * NB's own grid again, and again its own: EU 22.5, 32.5 and 34.5 exist here
 * and on no other kids chart, and NB puts 13.5 at EU 32 where Nike puts 1Y.
 *
 * NB writes toddler sizes with a T. Normalised to C for consistency with the
 * other charts — the scales are the same, only the letter differs.
 */
const NEW_BALANCE_KIDS_ROWS: SneakerSizeRow[] = [
  {eu: '21', kidsUs: '5C', men: {us: 5, uk: 4, cm: 12.1}},
  {eu: '21.5', kidsUs: '5.5C', men: {us: 5.5, uk: 4.5, cm: 12.7}},
  {eu: '22.5', kidsUs: '6C', men: {us: 6, uk: 5, cm: 13}},
  {eu: '23', kidsUs: '6.5C', men: {us: 6.5, uk: 5.5, cm: 13.3}},
  {eu: '23.5', kidsUs: '7C', men: {us: 7, uk: 6, cm: 14}},
  {eu: '24', kidsUs: '7.5C', men: {us: 7.5, uk: 6.5, cm: 14.3}},
  {eu: '25', kidsUs: '8C', men: {us: 8, uk: 7, cm: 14.6}},
  {eu: '25.5', kidsUs: '8.5C', men: {us: 8.5, uk: 7.5, cm: 15.2}},
  {eu: '26', kidsUs: '9C', men: {us: 9, uk: 8, cm: 15.6}},
  {eu: '26.5', kidsUs: '9.5C', men: {us: 9.5, uk: 8.5, cm: 15.9}},
  {eu: '27.5', kidsUs: '10C', men: {us: 10, uk: 9, cm: 16.5}},
  {eu: '28', kidsUs: '10.5C', men: {us: 10.5, uk: 9.5, cm: 16.8}},
  {eu: '28.5', kidsUs: '11C', men: {us: 11, uk: 10, cm: 17.2}},
  {eu: '29', kidsUs: '11.5C', men: {us: 11.5, uk: 10.5, cm: 17.8}},
  {eu: '30', match: [30, 29.5], kidsUs: '12C', men: {us: 12, uk: 11, cm: 18.1}},
  {eu: '30.5', kidsUs: '12.5C', men: {us: 12.5, uk: 11.5, cm: 18.4}},
  {eu: '31', kidsUs: '13C', men: {us: 13, uk: 12, cm: 19.1}},
  {
    eu: '32',
    match: [32, 31.5],
    kidsUs: '13.5C',
    men: {us: 13.5, uk: 12.5, cm: 19.4},
  },
  {eu: '32.5', kidsUs: '1Y', men: {us: 14, uk: 13, cm: 19.7}},
  {eu: '33', kidsUs: '1.5Y', men: {us: 14.5, uk: 13.5, cm: 20.3}},
  {eu: '33.5', kidsUs: '2Y', men: {us: 15, uk: 1, cm: 20.7}},
  {
    eu: '34.5',
    match: [34.5, 34],
    kidsUs: '2.5Y',
    men: {us: 15.5, uk: 1.5, cm: 21},
  },
  {eu: '35', kidsUs: '3Y', men: {us: 16, uk: 2, cm: 21.6}},
  {eu: '35.5', kidsUs: '3.5Y', men: {us: 16.5, uk: 2.5, cm: 21.9}},
  {eu: '36', kidsUs: '4Y', men: {us: 17, uk: 3, cm: 22.2}},
  {eu: '37', kidsUs: '4.5Y', men: {us: 17.5, uk: 3.5, cm: 22.9}},
  {eu: '37.5', kidsUs: '5Y', men: {us: 18, uk: 4, cm: 23.2}},
  {eu: '38', kidsUs: '5.5Y', men: {us: 18.5, uk: 4.5, cm: 23.5}},
  {eu: '38.5', kidsUs: '6Y', men: {us: 19, uk: 5, cm: 24.1}},
  {eu: '39', kidsUs: '6.5Y', men: {us: 19.5, uk: 5.5, cm: 24.5}},
  {eu: '40', kidsUs: '7Y', men: {us: 20, uk: 6, cm: 24.8}},
];

/**
 * UGG kids.
 *
 * UGG's own big-kids chart. It is a coarse ladder — twelve rows where Nike
 * has thirty-eight — because UGG sells kids' boots in whole sizes, and the
 * catalogue's UGG kids listings match it: 25, 26, 27.5, 28.5, 30, 31, 32.5,
 * 33.5, 35, 36, 37, 38.
 *
 * UGG's own notation is T then K; normalised to C then Y like the rest.
 */
const UGG_KIDS_ROWS: SneakerSizeRow[] = [
  {eu: '25', kidsUs: '8C', men: {us: 8, uk: 7, cm: 15}},
  {eu: '26', kidsUs: '9C', men: {us: 9, uk: 8, cm: 16}},
  {eu: '27.5', kidsUs: '10C', men: {us: 10, uk: 9, cm: 17}},
  {eu: '28.5', kidsUs: '11C', men: {us: 11, uk: 10, cm: 17.5}},
  {eu: '30', kidsUs: '12C', men: {us: 12, uk: 11, cm: 18.5}},
  {eu: '31', kidsUs: '13C', men: {us: 13, uk: 12, cm: 19.5}},
  {eu: '32.5', kidsUs: '1Y', men: {us: 14, uk: 13, cm: 20}},
  {eu: '33.5', kidsUs: '2Y', men: {us: 15, uk: 1, cm: 21}},
  {eu: '35', kidsUs: '3Y', men: {us: 16, uk: 2, cm: 22}},
  {eu: '36', kidsUs: '4Y', men: {us: 17, uk: 3, cm: 22.5}},
  {eu: '37', kidsUs: '5Y', men: {us: 18, uk: 4, cm: 23.5}},
  {eu: '38', kidsUs: '6Y', men: {us: 19, uk: 5, cm: 24.5}},
];

/**
 * The charts, most of the catalogue first, with the merged fallback last
 * because it is the one nobody should read unless their brand isn't above it.
 */
export const SIZE_CHARTS: SizeChart[] = [
  {
    key: 'nike',
    label: 'Nike & Jordan',
    brands: ['Nike', 'Jordan', 'Travis Scott', 'Nike x NOCTA'],
    sources: [
      {
        label: 'Nike (unisex)',
        url: 'https://www.nike.com/gb/size-fit/unisex-footwear-mens-based',
      },
      {
        label: "Nike (women's)",
        url: 'https://www.nike.com/gb/size-fit/womens-footwear',
      },
    ],
    rows: NIKE_ROWS,
  },
  {
    key: 'adidas',
    label: 'adidas, Yeezy, Salomon & HOKA',
    brands: ['adidas', 'Yeezy', 'Salomon', 'HOKA'],
    sources: [
      {label: 'adidas', url: 'https://www.adidas.co.uk/help/size_charts'},
      {
        label: 'Salomon',
        url: 'https://www.evo.com/pages/salomon-shoe-size-chart',
      },
      {label: 'HOKA', url: 'https://runrepeat.com/size-charts/hoka'},
    ],
    rows: ADIDAS_ROWS,
  },
  {
    key: 'new-balance',
    label: 'New Balance',
    brands: ['New Balance'],
    sources: [
      {
        label: 'New Balance via Solereview',
        url: 'https://www.solereview.com/new-balance-shoe-size-chart/',
      },
      {
        label: "New Balance via Kohl's",
        url: 'https://www.kohls.com/media/digital/ecom/size-charts/shoes/html/Mens-New-Balance-Shoes-Size-Chart.html',
      },
    ],
    rows: NEW_BALANCE_ROWS,
  },
  {
    key: 'asics',
    label: 'ASICS & Onitsuka Tiger',
    brands: ['ASICS', 'Onitsuka Tiger'],
    sources: [
      {
        label: 'ASICS via Up & Running',
        url: 'https://upandrunning.co.uk/pages/asics-shoes-size-guide',
      },
      {
        label: 'ASICS via Outdoor Equipped',
        url: 'https://www.outdoorequipped.com/pages/asics-size-chart',
      },
    ],
    rows: ASICS_ROWS,
  },
  {
    key: 'vans',
    label: 'Vans',
    brands: ['Vans'],
    sources: [
      {label: 'Vans', url: 'https://www.vans.com/en-us/help/size-charts'},
      {
        label: 'Vans via Tactics',
        url: 'https://www.tactics.com/sizing/vans-shoes-size-chart',
      },
    ],
    rows: VANS_ROWS,
  },
  {
    key: 'puma',
    label: 'Puma',
    brands: ['Puma'],
    sources: [
      {
        label: 'Puma via The Sole Story',
        url: 'https://thesolestory.com/en/pages/puma-footwear-size-chart-mens',
      },
      {
        label: 'Puma via Kicks Lab',
        url: 'https://www.kickslab.com/en/pages/puma-size-chart',
      },
    ],
    rows: PUMA_ROWS,
  },
  {
    key: 'converse',
    label: 'Converse',
    brands: ['Converse'],
    sources: [
      {label: 'Converse', url: 'https://www.converse.com/size-chart-guide'},
    ],
    rows: CONVERSE_ROWS,
  },
  {
    key: 'ugg',
    label: 'UGG',
    brands: ['UGG'],
    sources: [
      {
        label: 'UGG (all-gender)',
        url: 'https://www.ugg.com/size-fit-all-gender-footwear.html',
      },
      {
        label: 'UGG (sizing information)',
        url: 'https://www.ugg.com/sizing-information.html',
      },
    ],
    rows: UGG_ROWS,
  },
  {
    key: 'saucony',
    label: 'Saucony',
    brands: ['Saucony'],
    sources: [
      {
        label: 'Saucony via Outdoor Equipped',
        url: 'https://www.outdoorequipped.com/pages/saucony-size-chart',
      },
    ],
    rows: SAUCONY_ROWS,
  },
  {
    key: 'on-running',
    label: 'On Running',
    brands: ['On Running'],
    sources: [
      {
        label: 'On via Outsole',
        url: 'https://www.outsole.nl/en/shoe-size-charts/on-running-shoes-size-chart-women-men/',
      },
      {label: 'On via RunRepeat', url: 'https://runrepeat.com/size-charts/on'},
    ],
    rows: ON_RUNNING_ROWS,
  },
  {
    key: 'crocs',
    label: 'Crocs',
    brands: ['Crocs'],
    sources: [
      {
        label: 'Crocs via size-charts.com',
        url: 'https://size-charts.com/shoe-size-charts-page/crocs-shoes-size-chart/',
      },
      {
        label: 'Crocs via FootArt',
        url: 'https://www.footart.co.uk/crocs-sizing-and-fit-guide',
      },
    ],
    rows: CROCS_ROWS,
  },
  {
    key: 'standard',
    label: 'Everything else \u2014 standard conversion',
    brands: [],
    sources: [
      {
        label: 'Nike (unisex)',
        url: 'https://www.nike.com/gb/size-fit/unisex-footwear-mens-based',
      },
      {
        label: 'ASICS via Up & Running',
        url: 'https://upandrunning.co.uk/pages/asics-shoes-size-guide',
      },
      {label: 'Converse', url: 'https://www.converse.com/size-chart-guide'},
    ],
    rows: STANDARD_ROWS,
  },
];

/**
 * The fallback for a brand with no chart of its own. Deliberately the merged
 * standard table rather than Nike's: every EU number in the catalogue resolves
 * on it, where Nike's grid left five of them blank.
 */
/**
 * The kids charts, kept in their own list so the size guide can group them
 * under one heading and `SIZE_CHARTS` stays the adult table of contents.
 */
export const KIDS_SIZE_CHARTS: SizeChart[] = [
  {
    key: 'nike-kids',
    audience: 'kids',
    adultKey: 'nike',
    label: 'Nike & Jordan \u2014 kids',
    brands: ['Nike', 'Jordan', 'Travis Scott', 'Nike x NOCTA'],
    sources: [
      {
        label: 'Nike TD via The Sole Story',
        url: 'https://thesolestory.com/en/pages/nike-footwear-size-chart-kids',
      },
      {
        label: 'Nike PS via The Sole Story',
        url: 'https://thesolestory.com/en/pages/copy-of-nike-footwear-size-chart-baby-td-1',
      },
      {
        label: 'Nike GS via The Sole Story',
        url: 'https://thesolestory.com/en/pages/nike-footwear-size-chart-big-kids-gs',
      },
    ],
    rows: NIKE_KIDS_ROWS,
  },
  {
    key: 'adidas-kids',
    audience: 'kids',
    adultKey: 'adidas',
    label: 'adidas & Yeezy \u2014 kids',
    brands: ['adidas', 'Yeezy', 'Salomon', 'HOKA'],
    sources: [
      {
        label: 'adidas kids',
        url: 'https://www.adidas.com/us/help/size_charts/kids-shoes',
      },
    ],
    rows: ADIDAS_KIDS_ROWS,
  },
  {
    key: 'new-balance-kids',
    audience: 'kids',
    adultKey: 'new-balance',
    label: 'New Balance \u2014 kids',
    brands: ['New Balance'],
    sources: [
      {
        label: "New Balance kids via Kohl's",
        url: 'https://www.kohls.com/media/digital/ecom/size-charts/shoes/html/Kids-New-Balance-Shoe-Size-Chart.html',
      },
    ],
    rows: NEW_BALANCE_KIDS_ROWS,
  },
  {
    key: 'ugg-kids',
    audience: 'kids',
    adultKey: 'ugg',
    label: 'UGG \u2014 kids',
    brands: ['UGG'],
    sources: [
      {
        label: 'UGG big kids',
        url: 'https://www.ugg.com/size-fit-big-kids-shoes.html',
      },
    ],
    rows: UGG_KIDS_ROWS,
  },
];

/** Nike's is the kids fallback, exactly as Nike's is the adult one. */
const DEFAULT_KIDS_CHART = KIDS_SIZE_CHARTS[0];

const KIDS_CHART_BY_BRAND = new Map(
  KIDS_SIZE_CHARTS.flatMap((chart) =>
    chart.brands.map((brand) => [brand, chart]),
  ),
);

export const DEFAULT_CHART =
  SIZE_CHARTS.find((chart) => chart.key === 'standard') ?? SIZE_CHARTS[0];

const CHART_BY_BRAND = new Map(
  SIZE_CHARTS.flatMap((chart) => chart.brands.map((brand) => [brand, chart])),
);

const ROWS_BY_EU = new Map(
  [...SIZE_CHARTS, ...KIDS_SIZE_CHARTS].map((chart) => {
    const index = new Map<string, SneakerSizeRow>();
    for (const row of chart.rows) {
      // A row is reachable by its own EU number and by every notation the
      // catalogue writes it in — see `match`.
      const numbers = row.match ?? [Number(row.eu)];
      for (const number of numbers) {
        if (Number.isFinite(number)) index.set(sizeKey(number), row);
      }
    }
    return [chart.key, index] as const;
  }),
);

/**
 * Every charted brand as a pattern, in chart order, for the collab fallback
 * below. Built from the charts themselves so a new chart cannot be forgotten.
 */
const CHART_BY_PATTERN: {pattern: RegExp; chart: SizeChart}[] =
  SIZE_CHARTS.flatMap((chart) =>
    chart.brands.map((brand) => ({
      // Escape first: 'Comme des Gar\u00e7ons'-style labels and any future one
      // with a dot in it must not become a wildcard.
      pattern: new RegExp(
        `\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
        'i',
      ),
      chart,
    })),
  );

/**
 * The chart to read a product's sizes with.
 *
 * Keyed off the brand derived from the title, because `vendor` is the shop's
 * own name on every imported product.
 *
 * The second pass is for collabs. `brandFromTitle` answers "whose drop is
 * this", and for a "Vans Era Supreme x Mike Kelley" that is Supreme — correct
 * for the brand badge and the collection it belongs in, wrong for sizing,
 * because the shoe on the shelf is still a Vans and fits like one. So when the
 * brand that comes back has no chart, the title is scanned for one that does,
 * in chart order, and only then does the merged fallback apply. Four products
 * were reading Vans sizes off the generic table because of this.
 */
export function chartForTitle(title: string | null | undefined): SizeChart {
  const brand = brandFromTitle(title);
  const kids = title ? isKidsProduct(title) : false;
  const byBrand =
    brand &&
    (kids
      ? KIDS_CHART_BY_BRAND.get(brand.label)
      : CHART_BY_BRAND.get(brand.label));
  if (byBrand) return byBrand;
  if (title) {
    const collab = CHART_BY_PATTERN.find((entry) => entry.pattern.test(title));
    if (collab) {
      if (!kids) return collab.chart;
      const kidsChart = KIDS_SIZE_CHARTS.find((chart) =>
        chart.brands.some((b) => collab.chart.brands.includes(b)),
      );
      if (kidsChart) return kidsChart;
    }
  }
  return kids ? DEFAULT_KIDS_CHART : DEFAULT_CHART;
}

/** The adult chart a kids chart hands over to above its top size. */
function adultCounterpart(chart: SizeChart): SizeChart | undefined {
  if (!chart.adultKey) return undefined;
  return SIZE_CHARTS.find((entry) => entry.key === chart.adultKey);
}

/**
 * The row a size resolves to, following a kids chart up into its adult
 * counterpart when the size is past the end of the children's range.
 */
/**
 * "36-37 EU" → 36, and nothing else.
 *
 * Deliberately not part of `euSize`. That function's answer decides what the
 * picker hides: a value it can read is a value the 36–47 range filter acts on,
 * and a Crocs "48-49 EU" would start being hidden from a shop that sells it.
 * Reading the range here, where only the conversion is at stake, adds the US
 * column without touching what is on sale.
 */
function rangeSize(value: string): number | null {
  const range = /^(\d{2})\s*-\s*\d{2}\s*(?:eu)?$/i.exec(value.trim());
  return range ? Number(range[1]) : null;
}

function rowFor(
  size: number,
  chart: SizeChart,
): {row: SneakerSizeRow; chart: SizeChart} | undefined {
  const row = ROWS_BY_EU.get(chart.key)?.get(sizeKey(size));
  if (row) return {row, chart};
  const adult = adultCounterpart(chart);
  const adultRow = adult && ROWS_BY_EU.get(adult.key)?.get(sizeKey(size));
  return adultRow && adult ? {row: adultRow, chart: adult} : undefined;
}

/** "9" not "9.0", "10.5" as-is. */
export function printSize(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
}

/**
 * The secondary label for a size value, e.g. "41 EU" on a Nike + 'US_M' →
 * "US 8". The same EU number on a New Balance gives a different answer, which
 * is the entire reason this takes a chart.
 *
 * Returns null whenever there is nothing trustworthy to say: the shopper is
 * reading EU already, the value isn't a number (apparel), or the size sits
 * outside the adult grid.
 */
export function convertedSize(
  value: string,
  unit: SizeUnit,
  chart: SizeChart = DEFAULT_CHART,
): string | null {
  if (unit === 'EU') return null;
  const size = euSize(value) ?? rangeSize(value);
  if (size === null) return null;
  const found = rowFor(size, chart);
  if (!found) return null;
  const {row} = found;
  const uk = unit === 'UK_M' || unit === 'UK_W';
  // A kids size is one number for everyone, so the men's and women's buttons
  // answer the same thing — and a US kids size is printed with its scale
  // letter or it is a lie. UK kids sizes run 0.5–13.5 then restart at 1,
  // which is how they are written in the UK too.
  if (row.kidsUs) return uk ? `UK ${printSize(row.men.uk)}` : `US ${row.kidsUs}`;
  if (unit === 'UK_W') {
    // Nike publishes its own women's UK column. adidas and New Balance print
    // one UK column for everyone, so their rows carry no `women.uk` and the
    // men's figure IS the women's.
    if (!row.women) return null;
    return `UK ${printSize(row.women.uk ?? row.men.uk)}`;
  }
  if (unit === 'UK_M') return `UK ${printSize(row.men.uk)}`;
  if (unit === 'US_W') {
    return row.women ? `US ${printSize(row.women.us)}` : null;
  }
  return `US ${printSize(row.men.us)}`;
}

/** True when at least one value in the list has a conversion to offer. */
export function hasConvertibleSizes(
  values: {name: string}[],
  chart: SizeChart = DEFAULT_CHART,
): boolean {
  return values.some((value) => {
    const size = euSize(value.name) ?? rangeSize(value.name);
    return size !== null && rowFor(size, chart) !== undefined;
  });
}
