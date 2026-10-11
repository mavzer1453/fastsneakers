import type {ProductFilter} from '@shopify/hydrogen/storefront-api-types';

/**
 * Shared `?price_min / price_max / vendor / availability / show` handling for
 * collection pages. Filters map to the Storefront API `ProductFilter` input;
 * the sidebar UI reads the same URL params.
 */

export interface ParsedCollectionFilters {
  filters: ProductFilter[];
  priceMin: number | null;
  priceMax: number | null;
  vendors: string[];
  types: string[];
  /** Generic colour slugs from `?color=` (repeatable) — OR'd together. */
  colors: string[];
  /** Brand slugs from `?brand=` (repeatable) — OR'd together. */
  brands: string[];
  /** Size values from `?size=` (repeatable) — OR'd together. */
  sizes: string[];
  /** `?deals=1` — only products with a reduced price. */
  deals: boolean;
  /**
   * True when the selection can't be expressed as a single Storefront
   * query: the API ANDs its filters, so OR-ing values means the loader has
   * to union several queries and paginate the merged pool itself.
   */
  needsUnion: boolean;
  /** 'in' | 'out' | null — availability facet selection */
  availability: 'in' | 'out' | null;
  inStockOnly: boolean;
}

/**
 * The generic colour palette products are tagged with (`color:<slug>`), in
 * the order shoppers expect to see them. Swatches are approximate — they
 * only have to read as the colour family, not match any single product.
 */
export const COLOR_OPTIONS: Array<{
  slug: string;
  label: string;
  swatch: string;
}> = [
  {slug: 'black', label: 'Black', swatch: '#111111'},
  {slug: 'brown', label: 'Brown', swatch: '#6b4327'},
  {slug: 'beige', label: 'Beige', swatch: '#ddc9a3'},
  {slug: 'grey', label: 'Grey', swatch: '#8b8b8b'},
  {slug: 'white', label: 'White', swatch: '#ffffff'},
  {slug: 'blue', label: 'Blue', swatch: '#2f6fb0'},
  {slug: 'petrol', label: 'Petrol', swatch: '#2b7a86'},
  {slug: 'turquoise', label: 'Turquoise', swatch: '#40c9c9'},
  {slug: 'green', label: 'Green', swatch: '#3f8f4a'},
  {slug: 'olive', label: 'Olive', swatch: '#6f7340'},
  {slug: 'yellow', label: 'Yellow', swatch: '#f0c419'},
  {slug: 'orange', label: 'Orange', swatch: '#e8792b'},
  {slug: 'red', label: 'Red', swatch: '#c8202a'},
  {slug: 'pink', label: 'Pink', swatch: '#e58ab0'},
  {slug: 'purple', label: 'Purple', swatch: '#7b4ea8'},
  {slug: 'gold', label: 'Gold', swatch: '#c9a227'},
  {slug: 'silver', label: 'Silver', swatch: '#c3c7cb'},
  {slug: 'multicolor', label: 'Multicolour', swatch: 'multi'},
];

const COLOR_SLUGS = new Set(COLOR_OPTIONS.map((option) => option.slug));

function toNumber(value: string | null): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function parseCollectionFilters(url: URL): ParsedCollectionFilters {
  const params = url.searchParams;
  const vendors = params.getAll('vendor').filter(Boolean);
  const types = params.getAll('type').filter(Boolean);
  const priceMin = toNumber(params.get('price_min'));
  const priceMax = toNumber(params.get('price_max'));
  const availabilityParam = params.get('availability');
  const availability =
    availabilityParam === 'in' ? 'in' : availabilityParam === 'out' ? 'out' : null;
  const colors = params
    .getAll('color')
    .filter((slug) => COLOR_SLUGS.has(slug))
    .slice(0, 6);
  const brands = params.getAll('brand').filter(Boolean).slice(0, 6);
  const sizes = params.getAll('size').filter(Boolean).slice(0, 8);
  const deals = params.get('deals') === '1';

  // The Storefront API ANDs every entry in `filters`, so a single selected
  // value per group can go server-side; anything more (or a Deals filter,
  // which the API can't express at all) needs the union path.
  const groups = [colors, brands, sizes].filter((group) => group.length > 0);
  const needsUnion =
    deals ||
    groups.length > 1 ||
    groups.some((group) => group.length > 1);

  const filters: ProductFilter[] = [];
  if (!needsUnion) {
    if (colors.length === 1) filters.push({tag: `color:${colors[0]}`});
    if (brands.length === 1) filters.push({tag: brandFilterTag(brands[0])});
    if (sizes.length === 1) filters.push({tag: `size:${sizes[0]}`});
  }
  if (priceMin != null || priceMax != null) {
    filters.push({
      price: {
        ...(priceMin != null ? {min: priceMin} : {}),
        ...(priceMax != null ? {max: priceMax} : {}),
      },
    });
  }
  for (const vendor of vendors) {
    filters.push({productVendor: vendor});
  }
  for (const type of types) {
    filters.push({productType: type});
  }
  if (availability === 'in') {
    filters.push({available: true});
  } else if (availability === 'out') {
    filters.push({available: false});
  }

  return {
    filters,
    priceMin,
    priceMax,
    vendors,
    types,
    colors,
    brands,
    sizes,
    deals,
    needsUnion,
    availability,
    inStockOnly: availability === 'in',
  };
}

/**
 * A handful of imported products carry a €0.00 variant (a bad price in the
 * source feed). Shopify sorts a collection by each product's *minimum*
 * variant price, so those products jump to the front of "lowest price" while
 * the card shows a completely different figure — and worse, the €0 variant
 * is buyable. Keep them out of listings until the data is fixed.
 */
export function hasSellablePrice(product: {
  priceRange?: {minVariantPrice?: {amount?: string | null} | null} | null;
}): boolean {
  return Number(product?.priceRange?.minVariantPrice?.amount ?? 0) > 0;
}

/**
 * Products that exist only to be bought as an add-on, never browsed.
 *
 * Shipping protection has to be a published product for checkout to accept
 * it, and publishing is enough to sweep it into the smart collections:
 * `all` matches on "price > 0", and `men` is a set of NOT_CONTAINS title
 * rules that anything passes. Neither can be narrowed without changing how
 * the real catalog is merchandised, so the storefront filters it instead.
 */
const NON_CATALOG_HANDLES = new Set(['shipping-protection']);

/** Should this product appear in a grid, a rail, or search results? */
export function isCatalogProduct(product: {
  handle?: string | null;
}): boolean {
  return !NON_CATALOG_HANDLES.has(product?.handle ?? '');
}

/** Tag values for a `prefix:` family, read off the storefront tag facet. */
export function getTagFacetValues(
  filterData: FilterData[] | undefined | null,
  prefix: string,
): Array<{value: string; count: number}> {
  const tagFacet = filterData?.find((filter) => filter.id === 'filter.p.tag');
  const out: Array<{value: string; count: number}> = [];
  for (const value of tagFacet?.values ?? []) {
    const label = value.label ?? '';
    if (label.startsWith(`${prefix}:`)) {
      out.push({
        value: label.slice(prefix.length + 1),
        count: value.count ?? 0,
      });
    }
  }
  return out;
}

/**
 * Sizes sort naturally: numeric shoe sizes first, then apparel letters.
 *
 * Both spellings of the big sizes are listed, adjacent, because the
 * catalogue carries both. The tags come from the Size option values and
 * nothing normalises `XXL` to `2XL` — they are the same size, so they sort
 * side by side. Leaving `XXL` out dropped it past the known letters into
 * the localeCompare tail, next to `100CM` and `36-37`.
 */
const LETTER_ORDER = [
  'XXS',
  '2XS',
  'XS',
  'S',
  'M',
  'L',
  'XL',
  'XXL',
  '2XL',
  'XXXL',
  '3XL',
  'XXXXL',
  '4XL',
  '5XL',
];

export function sortSizeValues(
  values: Array<{value: string; count: number}>,
): Array<{value: string; count: number}> {
  return [...values].sort((a, b) => {
    const na = Number(a.value);
    const nb = Number(b.value);
    const aNum = Number.isFinite(na);
    const bNum = Number.isFinite(nb);
    if (aNum && bNum) return na - nb;
    if (aNum) return -1;
    if (bNum) return 1;
    const ia = LETTER_ORDER.indexOf(a.value.toUpperCase());
    const ib = LETTER_ORDER.indexOf(b.value.toUpperCase());
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.value.localeCompare(b.value);
  });
}

/** Pretty label for a brand slug, e.g. 'new-balance' → 'New Balance'. */
const BRAND_LABELS: Record<string, string> = {
  'nike': 'Nike',
  'jordan': 'Jordan',
  'new-balance': 'New Balance',
  'asics': 'ASICS',
  'adidas': 'adidas',
  'ugg': 'UGG',
  'essentials': 'Fear of God Essentials',
  'travis-scott': 'Travis Scott',
  'stussy': 'Stussy',
  'corteiz': 'Corteiz',
  'syna-world': 'Syna World',
  'represent': 'Represent',
  'ami-paris': 'AMI Paris',
  'nocta': 'NOCTA',
  'denim-tears': 'Denim Tears',
  'sp5der': 'Sp5der',
  'gallery-dept': 'Gallery Dept',
  'supreme': 'Supreme',
  'off-white': 'Off-White',
  'north-face': 'The North Face',
  'maison-margiela': 'Maison Margiela',
  'ralph-lauren': 'Ralph Lauren',
  'tommy-hilfiger': 'Tommy Hilfiger',
  'calvin-klein': 'Calvin Klein',
  'stone-island': 'Stone Island',
  'broken-planet': 'Broken Planet',
  'minus-two': 'Minus Two',
  'on-running': 'On Running',
  // Brands that arrived with the SneakerAsk import.
  'puma': 'Puma',
  'salomon': 'Salomon',
  'vans': 'Vans',
  'crocs': 'Crocs',
  'converse': 'Converse',
  'saucony': 'Saucony',
  'maison-mihara-yasuhiro': 'Maison Mihara Yasuhiro',
  'hoka': 'HOKA',
  'birkenstock': 'Birkenstock',
  'timberland': 'Timberland',
  'dr-martens': 'Dr. Martens',
  'onitsuka-tiger': 'Onitsuka Tiger',
  'reebok': 'Reebok',
  'under-armour': 'Under Armour',
  'yeezy': 'Yeezy',
  'vale-forever': 'Vale Forever',
  'hellstar': 'Hellstar',
  'vlone': 'Vlone',
  'godspeed': 'Godspeed',
  'bape': 'BAPE',
  'jacquemus': 'Jacquemus',
  'comme-des-garcons': 'Comme des Garçons',
};

/**
 * Brand filter structure — a mirror of the MENU (owner request, 2026-09-21:
 * "when Brand is ticked it should show whatever is in the menu bar").
 *
 * Groups follow the menu's order: the Sneakers department's brands, then the
 * Clothing department's. A group's children are the rows the menu lists under
 * that brand, in the menu's order and with the menu's labels; a few extra
 * silhouettes the menu does not list (Dunk High, Air Max 90…) sit next to
 * their family because they are real, well-stocked filters.
 *
 * Every row is a TAG, because tags are the only facet this store exposes
 * (`filter.p.tag`) — a `productType` filter is silently ignored:
 *   house      `brand:<value>`        (or `parent.tag` — Yeezy is model:yeezy,
 *                                      its products are brand:adidas)
 *   silhouette `model:<value>`
 *   collab     value `collab-<slug>` -> `collab:<slug>`
 *   garment    value `type-<slug>`   -> `type:<slug>` (scripts/sync-type-tags.mjs)
 *
 * Collab and garment rows are `scopedOnly`: they only make sense on the
 * brand's own page ("T-Shirts" on a department page would not say whose).
 *
 * Keep in step with SNEAKERS_MENU_ITEM / CLOTHING_MENU_ITEM in
 * app/components/Header.tsx when the menu changes.
 */
export interface BrandChild {
  /** What travels in `?brand=`. */
  value: string;
  label: string;
  /** This row's own collection page, when its handle is not `value`. */
  handle?: string;
  /** Offered on the brand's own pages only. */
  scopedOnly?: boolean;
}

export interface BrandGroup {
  parent: {value: string; label: string; tag?: string};
  /** The brand's collection handle, when it is not the slug. */
  handle?: string;
  children: BrandChild[];
}

const collab = (slug: string, label: string, handle?: string): BrandChild => ({
  value: `collab-${slug}`,
  label,
  handle: handle ?? `collab-${slug}`,
  scopedOnly: true,
});

/** Garment slugs carried by the `type:` tag. Mirrors TYPE_TAGS in
 *  scripts/lib/taxonomy.mjs. */
const TYPE_ROWS: Record<string, string> = {
  't-shirts': 'T-Shirts',
  'hoodies': 'Hoodies',
  'jackets': 'Jackets',
  'pants': 'Pants',
  'shorts': 'Shorts',
  'tracksuits': 'Tracksuits',
  'accessories': 'Accessories',
};

const garment = (slug: string, handle: string, label?: string): BrandChild => ({
  value: `type-${slug}`,
  label: label ?? TYPE_ROWS[slug] ?? slug,
  handle,
  scopedOnly: true,
});

export const BRAND_GROUPS: BrandGroup[] = [
  // ------------------------------------------------ Sneakers department ---
  {
    parent: {value: 'nike', label: 'Nike'},
    children: [
      {value: 'nike-dunk', label: 'Nike Dunk'},
      {value: 'nike-dunk-low', label: 'Dunk Low'},
      {value: 'nike-dunk-high', label: 'Dunk High'},
      {value: 'nike-dunk-sb', label: 'SB Dunk'},
      {value: 'nike-air-force-1', label: 'Air Force 1'},
      {value: 'nike-air-max', label: 'Air Max'},
      {value: 'nike-air-max-1', label: 'Air Max 1'},
      {value: 'nike-air-max-90', label: 'Air Max 90'},
      {value: 'nike-air-max-95', label: 'Air Max 95'},
      {value: 'nike-air-max-plus', label: 'Air Max Plus (TN)'},
      {value: 'nike-air-max-big-bubble', label: 'Air Max Big Bubble'},
      {value: 'nike-air-max-dn', label: 'Air Max Dn'},
      {value: 'nike-zoom-vomero', label: 'Zoom Vomero'},
      {value: 'nike-vomero-5', label: 'Zoom Vomero 5'},
      {value: 'nike-p-6000', label: 'P-6000'},
      {value: 'nike-shox', label: 'Shox'},
      {value: 'nike-shox-tl', label: 'Shox TL'},
      {value: 'nike-kobe', label: 'Kobe'},
      {value: 'nike-lebron', label: 'LeBron'},
      {value: 'nike-blazer', label: 'Blazer'},
      {value: 'nike-golf', label: 'Golf'},
      {value: 'nike-pegasus', label: 'Pegasus'},
      {value: 'nike-cortez', label: 'Cortez'},
      {value: 'nike-total-90', label: 'Total 90'},
      {value: 'nike-reactx', label: 'ReactX'},
      collab('travis-scott', 'Nike x Travis Scott', 'travis-scott-sneakers'),
      collab('off-white', 'Nike x Off-White', 'nike-off-white'),
      collab('sacai', 'Nike x sacai', 'nike-sacai'),
      collab('nocta', 'Nike x NOCTA', 'nike-nocta'),
      collab('supreme', 'Nike x Supreme', 'nike-supreme'),
      collab('patta', 'Nike x Patta', 'nike-patta'),
    ],
  },
  {
    parent: {value: 'jordan', label: 'Jordan'},
    children: [
      {value: 'air-jordan-1', label: 'Air Jordan 1'},
      {value: 'air-jordan-1-high', label: 'Jordan 1 High'},
      {value: 'air-jordan-1-mid', label: 'Jordan 1 Mid'},
      {value: 'air-jordan-1-low', label: 'Jordan 1 Low'},
      {value: 'air-jordan-3', label: 'Air Jordan 3'},
      {value: 'air-jordan-4', label: 'Air Jordan 4'},
      {value: 'air-jordan-5', label: 'Air Jordan 5'},
      {value: 'air-jordan-6', label: 'Air Jordan 6'},
      {value: 'air-jordan-11', label: 'Air Jordan 11'},
      {value: 'jumpman-jack', label: 'Jumpman Jack'},
    ],
  },
  {
    parent: {value: 'adidas', label: 'adidas'},
    children: [
      {value: 'adidas-samba', label: 'Samba'},
      {value: 'adidas-gazelle', label: 'Gazelle'},
      {value: 'adidas-gazelle-indoor', label: 'Gazelle Indoor'},
      {value: 'adidas-gazelle-bold', label: 'Gazelle Bold'},
      {value: 'adidas-campus', label: 'Campus'},
      {value: 'adidas-campus-00s', label: 'Campus 00s'},
      {value: 'adidas-spezial', label: 'Handball Spezial'},
      {value: 'adidas-superstar', label: 'Superstar'},
      {value: 'adidas-xlg', label: 'XLG'},
      {value: 'adidas-taekwondo', label: 'Taekwondo'},
      {value: 'adidas-sl-72', label: 'SL 72'},
      collab('wales-bonner', 'adidas x Wales Bonner'),
      collab('bad-bunny', 'adidas x Bad Bunny'),
    ],
  },
  {
    parent: {value: 'new-balance', label: 'New Balance'},
    children: [
      {value: 'new-balance-9060', label: '9060'},
      {value: 'new-balance-1906', label: '1906'},
      {value: 'new-balance-1906l', label: '1906L'},
      {value: 'new-balance-2002r', label: '2002R'},
      {value: 'new-balance-550', label: '550'},
      {value: 'new-balance-530', label: '530'},
      {value: 'new-balance-740', label: '740'},
      {value: 'new-balance-1000', label: '1000'},
      {value: 'new-balance-204l', label: '204L'},
      {value: 'new-balance-abzorb', label: 'ABZORB'},
    ],
  },
  {
    // Yeezy products are tagged brand:adidas; the line itself is model:yeezy.
    parent: {value: 'yeezy', label: 'Yeezy', tag: 'model:yeezy'},
    children: [
      {value: 'yeezy-350', label: 'Yeezy 350'},
      {value: 'yeezy-700', label: 'Yeezy 700'},
      {value: 'yeezy-slide', label: 'Yeezy Slides'},
      {value: 'yeezy-foam-rnnr', label: 'Foam RNNR'},
    ],
  },
  {
    parent: {value: 'asics', label: 'ASICS'},
    children: [
      {value: 'asics-gel-nyc', label: 'Gel-NYC'},
      {value: 'asics-gel-kayano', label: 'Gel-Kayano'},
      {value: 'asics-gel-1130', label: 'Gel-1130'},
      {value: 'asics-gel-nimbus', label: 'Gel-Nimbus'},
      {value: 'asics-gt-2160', label: 'GT-2160'},
    ],
  },
  {
    parent: {value: 'ugg', label: 'UGG'},
    handle: 'ugg-boots-slippers',
    children: [
      {value: 'ugg-tasman', label: 'Tasman'},
      {value: 'ugg-tazz', label: 'Tazz'},
      {value: 'ugg-lowmel', label: 'Lowmel'},
      {value: 'ugg-golden', label: 'Golden'},
      {value: 'ugg-jasmine', label: 'Jasmine'},
      {value: 'ugg-neumel', label: 'Neumel'},
      {value: 'ugg-bailey', label: 'Bailey'},
      {value: 'ugg-classic-ultra-mini', label: 'Classic Ultra Mini'},
      {value: 'ugg-classic-mini', label: 'Classic Mini'},
      {value: 'ugg-classic-micro', label: 'Classic Micro'},
      {value: 'ugg-platform', label: 'Platform'},
    ],
  },
  {
    parent: {value: 'puma', label: 'Puma'},
    children: [
      {value: 'puma-speedcat', label: 'Speedcat'},
      {value: 'puma-lamelo-ball', label: 'LaMelo Ball'},
    ],
  },
  {
    parent: {value: 'salomon', label: 'Salomon'},
    children: [{value: 'salomon-xt-6', label: 'XT-6'}],
  },
  {
    parent: {value: 'vans', label: 'Vans'},
    children: [{value: 'vans-old-skool', label: 'Old Skool'}],
  },
  {
    parent: {value: 'crocs', label: 'Crocs'},
    children: [{value: 'crocs-classic-clog', label: 'Classic Clog'}],
  },
  {
    parent: {value: 'converse', label: 'Converse'},
    children: [{value: 'converse-chuck-taylor', label: 'Chuck Taylor'}],
  },
  {
    parent: {value: 'saucony', label: 'Saucony'},
    children: [{value: 'saucony-progrid', label: 'ProGrid'}],
  },
  {
    parent: {value: 'hoka', label: 'HOKA'},
    children: [{value: 'hoka-one-one', label: 'One One'}],
  },
  {
    parent: {value: 'birkenstock', label: 'Birkenstock'},
    children: [{value: 'birkenstock-boston', label: 'Boston'}],
  },
  // No silhouettes of their own. A parent-only group still renders its
  // "(all)" row, which is what makes the brand selectable on a department page.
  {parent: {value: 'on-running', label: 'On Running'}, children: []},
  {parent: {value: 'timberland', label: 'Timberland'}, children: []},
  {
    parent: {value: 'maison-mihara-yasuhiro', label: 'Maison Mihara Yasuhiro'},
    children: [],
  },
  {parent: {value: 'comme-des-garcons', label: 'Comme des Garçons'}, children: []},
  {parent: {value: 'under-armour', label: 'Under Armour'}, children: []},
  // Stocked, but not on the menu.
  {parent: {value: 'dr-martens', label: 'Dr. Martens'}, children: []},
  {parent: {value: 'onitsuka-tiger', label: 'Onitsuka Tiger'}, children: []},
  {parent: {value: 'reebok', label: 'Reebok'}, children: []},

  // ------------------------------------------------ Clothing department ---
  {
    parent: {value: 'essentials', label: 'Fear of God Essentials'},
    children: [
      garment('tracksuits', 'essentials-sets', 'Sets'),
      garment('hoodies', 'essentials-hoodies'),
      garment('t-shirts', 'essentials-tees'),
      garment('pants', 'essentials-pants'),
      garment('shorts', 'essentials-shorts'),
      garment('jackets', 'essentials-jackets'),
    ],
  },
  {
    parent: {value: 'supreme', label: 'Supreme'},
    children: [
      garment('t-shirts', 'supreme-t-shirts'),
      garment('hoodies', 'supreme-hoodies'),
      garment('jackets', 'supreme-jackets'),
      garment('pants', 'supreme-pants'),
      garment('accessories', 'supreme-accessories'),
    ],
  },
  {
    parent: {value: 'stussy', label: 'Stussy'},
    children: [
      garment('t-shirts', 'stussy-t-shirts'),
      garment('hoodies', 'stussy-hoodies'),
    ],
  },
  {
    parent: {value: 'sp5der', label: 'Sp5der'},
    children: [
      garment('hoodies', 'sp5der-hoodies'),
      garment('t-shirts', 'sp5der-t-shirts'),
      garment('pants', 'sp5der-pants'),
    ],
  },
  {
    parent: {value: 'denim-tears', label: 'Denim Tears'},
    children: [
      garment('pants', 'denim-tears-pants'),
      garment('hoodies', 'denim-tears-hoodies'),
      garment('shorts', 'denim-tears-shorts'),
    ],
  },
  {
    parent: {value: 'travis-scott', label: 'Travis Scott'},
    children: [
      garment('t-shirts', 'travis-scott-t-shirts'),
      garment('hoodies', 'travis-scott-hoodies'),
    ],
  },
  {
    parent: {value: 'vale-forever', label: 'Vale Forever'},
    children: [
      garment('hoodies', 'vale-forever-hoodies'),
      garment('t-shirts', 'vale-forever-t-shirts'),
    ],
  },
  {
    parent: {value: 'godspeed', label: 'Godspeed'},
    children: [
      garment('hoodies', 'godspeed-hoodies'),
      garment('t-shirts', 'godspeed-t-shirts'),
    ],
  },
  {
    parent: {value: 'bape', label: 'BAPE'},
    children: [garment('t-shirts', 'bape-t-shirts')],
  },
  {
    parent: {value: 'vlone', label: 'Vlone'},
    children: [garment('t-shirts', 'vlone-t-shirts')],
  },
  {
    parent: {value: 'syna-world', label: 'Syna World'},
    children: [garment('tracksuits', 'syna-world-tracksuits')],
  },
  {parent: {value: 'hellstar', label: 'Hellstar'}, children: []},
  {parent: {value: 'gallery-dept', label: 'Gallery Dept'}, children: []},
  {parent: {value: 'corteiz', label: 'Corteiz'}, children: []},
  {parent: {value: 'represent', label: 'Represent'}, children: []},
  // NOCTA products are brand:nike + collab:nocta, so the row filters on the
  // collab tag (same trick as Yeezy → model:yeezy).
  {parent: {value: 'nocta', label: 'NOCTA', tag: 'collab:nocta'}, children: []},
  {parent: {value: 'ami-paris', label: 'AMI Paris'}, children: []},
  // --------------------------------------------- Accessories department ---
  {
    parent: {value: 'jacquemus', label: 'Jacquemus'},
    children: [
      {value: 'jacquemus-le-grand-bambino', label: 'Le Grand Bambino'},
      {value: 'jacquemus-le-bambino', label: 'Le Bambino'},
      {value: 'jacquemus-le-long-bambino', label: 'Le Long Bambino'},
      {value: 'jacquemus-croco', label: 'Croco'},
    ],
  },
];

const MODEL_VALUES = new Set<string>();
const PARENT_TAGS = new Map<string, string>();
const VALUE_LABELS = new Map<string, string>();
for (const group of BRAND_GROUPS) {
  if (group.parent.tag) PARENT_TAGS.set(group.parent.value, group.parent.tag);
  for (const child of group.children) {
    if (!/^(collab|type)-/.test(child.value)) MODEL_VALUES.add(child.value);
    if (!VALUE_LABELS.has(child.value)) VALUE_LABELS.set(child.value, child.label);
  }
}

/**
 * Houses, silhouettes, collabs and garments all ride in the same `?brand=`
 * param so they OR together (picking "Nike Dunk" + "Air Jordan 1" should
 * widen, not narrow). This maps each value back to the tag that filters it.
 */
export function brandFilterTag(value: string): string {
  if (value.startsWith('collab-')) return `collab:${value.slice(7)}`;
  if (value.startsWith('type-')) return `type:${value.slice(5)}`;
  if (MODEL_VALUES.has(value)) return `model:${value}`;
  return PARENT_TAGS.get(value) ?? `brand:${value}`;
}

export interface BrandRow {
  /** Slugs this row toggles — a family row carries all of its members. */
  values: string[];
  label: string;
  count: number;
  isFamilyParent?: boolean;
  /** Extra text the panel's search box matches ("nike" finds "Air Force 1"). */
  keywords?: string;
}

/** The brand whose page this is — the brand's own collection or one of its
 *  silhouette / garment pages. Collab pages span houses, so they are not. */
function scopeFor(handle: string | null | undefined): BrandGroup | null {
  if (!handle) return null;
  return (
    BRAND_GROUPS.find((group) => (group.handle ?? group.parent.value) === handle) ??
    BRAND_GROUPS.find((group) =>
      group.children.some(
        (child) =>
          !child.value.startsWith('collab-') &&
          (child.handle ?? child.value) === handle,
      ),
    ) ??
    null
  );
}

/**
 * Turn the flat tag facet into the rows the Brand filter renders.
 *
 * ON A BRAND'S OWN PAGE (adidas, Stussy, UGG…) the panel is that brand's menu
 * entry: its silhouettes, collabs or garments, in the menu's order, and
 * nothing else — no "(all)" row (the page already is all of it) and no other
 * houses that happen to share the shelf (Yeezy on adidas, Nike on Stussy).
 * One row or none is not a choice, so the filter hides itself then.
 *
 * EVERYWHERE ELSE (Sneakers, Sale, Men…) every house present is listed in the
 * menu's order: an "(all)" row, then its silhouettes. Rows whose count is 0
 * in the current collection drop out, so Clothing never offers "Nike Dunk".
 */
export function buildBrandRows(
  facets: {
    brand: Array<{value: string; count: number}>;
    model?: Array<{value: string; count: number}>;
    collab?: Array<{value: string; count: number}>;
    type?: Array<{value: string; count: number}>;
  },
  handle?: string | null,
): BrandRow[] {
  const counts = new Map<string, number>();
  for (const entry of facets.brand) counts.set(`brand:${entry.value}`, entry.count);
  for (const entry of facets.model ?? []) counts.set(`model:${entry.value}`, entry.count);
  for (const entry of facets.collab ?? []) counts.set(`collab:${entry.value}`, entry.count);
  for (const entry of facets.type ?? []) counts.set(`type:${entry.value}`, entry.count);
  const countOf = (value: string) => counts.get(brandFilterTag(value)) ?? 0;

  const scope = scopeFor(handle);
  if (scope) {
    const rows = scope.children
      .filter((child) => countOf(child.value) > 0)
      .map((child) => ({
        values: [child.value],
        label: child.label,
        count: countOf(child.value),
        keywords: scope.parent.label,
      }));
    return rows.length > 1 ? rows : [];
  }

  const used = new Set<string>();
  const rows: BrandRow[] = [];
  for (const group of BRAND_GROUPS) {
    const parentCount = countOf(group.parent.value);
    const children = group.children.filter(
      (child) => !child.scopedOnly && countOf(child.value) > 0,
    );
    used.add(group.parent.value);
    // Nothing from this house in the current collection — skip it entirely.
    if (parentCount === 0 && children.length === 0) continue;

    // On a collab shelf the house tag belongs to the collaborator
    // (brand:travis-scott), so "Nike" has silhouettes but no count of its
    // own. Its rows still list; an "(all)" row would have to add up
    // overlapping tags (Dunk + Dunk Low) and claim more pairs than exist.
    if (parentCount > 0) {
      rows.push({
        values: [group.parent.value],
        label: `${group.parent.label} (all)`,
        count: parentCount,
        isFamilyParent: true,
      });
    }
    for (const child of children) {
      rows.push({
        values: [child.value],
        label: child.label,
        count: countOf(child.value),
        keywords: group.parent.label,
      });
    }
  }

  // Houses with no entry above stay selectable as a flat row.
  for (const entry of facets.brand) {
    if (used.has(entry.value) || entry.count === 0) continue;
    rows.push({
      values: [entry.value],
      label: brandLabel(entry.value),
      count: entry.count,
    });
  }

  return rows;
}

export function brandLabel(slug: string): string {
  return (
    VALUE_LABELS.get(slug) ??
    BRAND_LABELS[slug] ??
    slug
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  );
}

/**
 * Per-colour product counts from the storefront tag facet (`filter.p.tag`,
 * surfaced by Shopify's Search & Discovery app). Colours the current
 * collection has no products for are returned with a count of 0 so the UI
 * can grey them out instead of offering a dead end.
 */
export function getColorCounts(
  filterData: FilterData[] | undefined | null,
): Record<string, number> {
  const counts: Record<string, number> = {};
  const tagFacet = filterData?.find((filter) => filter.id === 'filter.p.tag');
  for (const value of tagFacet?.values ?? []) {
    const label = value.label ?? '';
    if (label.startsWith('color:')) {
      counts[label.slice('color:'.length)] = value.count ?? 0;
    }
  }
  return counts;
}

/** Page size from `?show=`, whitelisted. */
export function parseShow(url: URL): number {
  // Legacy bookmarked URLs with ?show=96 fall back to 48 — the variant
  // payload for quick add makes 96-product pages too heavy on phones.
  switch (url.searchParams.get('show')) {
    case '48': // falls through
    case '96':
      return 48;
    default:
      return 24;
  }
}

/** Loose shape of the `products.filters` metadata from the Storefront API. */
export interface FilterValueData {
  id: string;
  label: string;
  count: number;
  input: unknown;
}

export interface FilterData {
  id: string;
  label: string;
  type: string;
  values: FilterValueData[];
}

/**
 * Total product count for the current filter context — the availability
 * facet's value counts always sum to the full matching set.
 */
export function getTotalCount(
  filterData: FilterData[] | undefined | null,
): number | null {
  const availability = filterData?.find((filter) =>
    filter.id.includes('availability'),
  );
  if (!availability) return null;
  return availability.values.reduce((sum, value) => sum + (value.count ?? 0), 0);
}

/** Brand facet values (label + count), if the store exposes vendors. */
export function getVendorValues(
  filterData: FilterData[] | undefined | null,
): FilterValueData[] {
  return (
    filterData?.find((filter) => filter.id.includes('vendor'))?.values ?? []
  );
}

/** Product-type facet values (label + count) for the Category filter. */
export function getTypeValues(
  filterData: FilterData[] | undefined | null,
): FilterValueData[] {
  return (
    filterData?.find((filter) => filter.id.includes('product_type'))?.values ??
    []
  );
}

export interface TypeGroup {
  /** Shopper-facing label, e.g. "Sneakers". */
  display: string;
  /** Raw productType values folded into this row (case variants etc). */
  raws: string[];
  count: number;
}

/**
 * The catalog contains case variants of the same type (legacy `sneakers`
 * next to canonical `Sneakers`) — group facet values by display label so
 * the Category filter shows one row per real category. Toggling a row
 * toggles every raw value in the group.
 */
export function groupTypeValues(
  filterData: FilterData[] | undefined | null,
): TypeGroup[] {
  const groups = new Map<string, TypeGroup>();
  for (const value of getTypeValues(filterData)) {
    const display = displayTypeLabel(value.label);
    const existing = groups.get(display);
    if (existing) {
      existing.raws.push(value.label);
      existing.count += value.count ?? 0;
    } else {
      groups.set(display, {
        display,
        raws: [value.label],
        count: value.count ?? 0,
      });
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

/** In-stock / out-of-stock counts from the availability facet. */
export function getAvailabilityCounts(
  filterData: FilterData[] | undefined | null,
): {inStock: number; outOfStock: number} | null {
  const availability = filterData?.find((filter) =>
    filter.id.includes('availability'),
  );
  if (!availability) return null;
  let inStock = 0;
  let outOfStock = 0;
  for (const value of availability.values) {
    try {
      const input =
        typeof value.input === 'string'
          ? (JSON.parse(value.input) as {available?: boolean})
          : (value.input as {available?: boolean});
      if (input?.available === true) inStock = value.count ?? 0;
      else if (input?.available === false) outOfStock = value.count ?? 0;
    } catch {
      // ignore malformed facet input
    }
  }
  return {inStock, outOfStock};
}

/**
 * The catalog's raw product types are a multilingual mix from imports —
 * map them to shopper-friendly labels for the Category filter.
 */
const TYPE_LABELS: Record<string, string> = {
  'sneakers': 'Sneakers',
  'Sneakers': 'Sneakers',
  'T-Shirts': 'T-Shirts',
  'Tops': 'Tops',
  'Hoodies': 'Hoodies & Sweatshirts',
  'Jackets': 'Jackets & Outerwear',
  'Pants': 'Pants & Jeans',
  'Shorts': 'Shorts',
  'Tracksuits': 'Sets & Tracksuits',
  'Accessories': 'Accessories',
  'Boots': 'Boots',
  'Slippers': 'Slippers & Slides',
};

export function displayTypeLabel(raw: string): string {
  return TYPE_LABELS[raw] ?? raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Min/max price bounds across the current collection, for the slider. */
export function getPriceBounds(
  filterData: FilterData[] | undefined | null,
): {min: number; max: number} | null {
  const price = filterData?.find((filter) => filter.type === 'PRICE_RANGE');
  const input = price?.values?.[0]?.input;
  if (typeof input !== 'string') return null;
  try {
    const parsed = JSON.parse(input) as {
      price?: {min?: number; max?: number};
    };
    const min = Math.floor(parsed?.price?.min ?? 0);
    const max = Math.ceil(parsed?.price?.max ?? 0);
    if (max <= 0 && min <= 0) return null;
    return {min, max};
  } catch {
    return null;
  }
}
