import {SHOP} from '~/data/shop';

/**
 * Product vendors that are really "us" under a legacy name. The Shopify
 * catalog was imported with the old store name as the vendor on every
 * product, so anywhere a vendor is rendered (cards, product page, JSON-LD)
 * we map it back to the current brand.
 *
 * To permanently fix the data itself, bulk-update `vendor` on the products
 * in Shopify admin — this mapping keeps the storefront correct either way.
 */
const LEGACY_VENDORS = new Set(['easyhairkit', 'vitalex']);

/** Map legacy placeholder vendors to the current brand name. */
export function displayVendor(
  vendor: string | null | undefined,
): string | undefined {
  if (!vendor) return undefined;
  return LEGACY_VENDORS.has(vendor.trim().toLowerCase()) ? SHOP.name : vendor;
}

/**
 * Vendor label for product cards: hide the label entirely when the vendor
 * is just the shop itself (every imported product), so cards stay clean —
 * real third-party vendor names still show.
 */
export function cardVendor(
  vendor: string | null | undefined,
): string | undefined {
  const display = displayVendor(vendor);
  return display === SHOP.name ? undefined : display;
}

/**
 * Brand collections that exist in Shopify (see SHOPIFY_SETUP.md), largest
 * catalogs first. Used by the filter sidebar's Brand section and anywhere
 * else a brand nav is rendered.
 */
/**
 * Derive the real brand from a product title (vendor data is still the
 * legacy placeholder). Ordered — first match wins; collab keywords sit
 * above their parent brand. `handle` links to the brand's collection when
 * one exists.
 */
const TITLE_BRANDS: Array<{
  pattern: RegExp;
  label: string;
  handle?: string;
}> = [
  {pattern: /jordan|jumpman/i, label: 'Jordan', handle: 'jordan'},
  {pattern: /travis scott|cactus jack/i, label: 'Travis Scott', handle: 'travis-scott'},
  {pattern: /nocta/i, label: 'Nike x NOCTA', handle: 'nike-nocta'},
  // Model names stand in for the brand where the title leaves it out — the
  // adidas rule below already did this for Samba and Gazelle. Without it
  // "Dunk Low LX Black Croc" has no brand in its Brand spec or its JSON-LD.
  {
    pattern: /nike|\bdunk\b|air force 1|air max|vomero|\bp-6000\b|cortez/i,
    label: 'Nike',
    handle: 'nike',
  },
  {pattern: /new balance/i, label: 'New Balance', handle: 'new-balance'},
  {pattern: /asics/i, label: 'ASICS', handle: 'asics'},
  {pattern: /adidas|samba|spezial|gazelle|campus/i, label: 'adidas', handle: 'adidas'},
  {pattern: /\bugg\b/i, label: 'UGG', handle: 'ugg-boots-slippers'},
  {pattern: /essential|fear of god/i, label: 'Fear of God Essentials', handle: 'essentials'},
  {pattern: /stussy/i, label: 'Stussy', handle: 'stussy'},
  {pattern: /corteiz|crtz/i, label: 'Corteiz', handle: 'corteiz'},
  {pattern: /syna/i, label: 'Syna World', handle: 'syna-world'},
  {pattern: /represent/i, label: 'Represent', handle: 'represent'},
  {pattern: /\bami\b|ami de c(?:oe|œ)ur/i, label: 'AMI Paris', handle: 'ami-paris'},
  {pattern: /denim tears|denim trs/i, label: 'Denim Tears', handle: 'denim-tears'},
  {pattern: /sp5der|spyder/i, label: 'Sp5der', handle: 'sp5der'},
  {pattern: /gallery/i, label: 'Gallery Dept', handle: 'gallery-dept'},
  {pattern: /supreme/i, label: 'Supreme', handle: 'supreme'},
  {pattern: /timberland/i, label: 'Timberland'},
  {pattern: /jacquemus/i, label: 'Jacquemus'},
  {pattern: /skims/i, label: 'SKIMS'},
  {pattern: /stone island/i, label: 'Stone Island'},
  {pattern: /hellstar/i, label: 'Hellstar'},
  // Brands that arrived with the SneakerAsk import. Without an entry here the
  // product page falls back to the vendor field, which is our own shop name on
  // every product — so the brand line would read "Fast Sneakers".
  {pattern: /vale forever/i, label: 'Vale Forever', handle: 'vale-forever'},
  {pattern: /\bsalomon\b/i, label: 'Salomon', handle: 'salomon'},
  {pattern: /\bpuma\b/i, label: 'Puma', handle: 'puma'},
  {pattern: /\bvans\b/i, label: 'Vans', handle: 'vans'},
  // Plural only. "Croc" on its own is a leather finish ("Dunk Low LX Black
  // Croc", "Air Max 90 Sail Croc Print"), and matching it put Crocs in the
  // Brand spec and the Product JSON-LD of thirteen Nike, adidas and New
  // Balance sneakers.
  {pattern: /\bcrocs\b/i, label: 'Crocs', handle: 'crocs'},
  {pattern: /\bconverse\b/i, label: 'Converse', handle: 'converse'},
  {pattern: /\bsaucony\b/i, label: 'Saucony', handle: 'saucony'},
  {
    pattern: /maison mihara|mihara yasuhiro/i,
    label: 'Maison Mihara Yasuhiro',
    handle: 'maison-mihara-yasuhiro',
  },
  {pattern: /\bhoka\b/i, label: 'HOKA'},
  {pattern: /birkenstock/i, label: 'Birkenstock'},
  {pattern: /on running|\bon\b cloud/i, label: 'On Running', handle: 'on-running'},
  {pattern: /\breebok\b/i, label: 'Reebok'},
  {pattern: /under armour/i, label: 'Under Armour'},
  {pattern: /dr\.? martens/i, label: 'Dr. Martens'},
  {pattern: /onitsuka tiger/i, label: 'Onitsuka Tiger'},
  {pattern: /\bbape\b|a bathing ape/i, label: 'BAPE'},
  {pattern: /\bvlone\b/i, label: 'Vlone'},
  {pattern: /godspeed/i, label: 'Godspeed'},
  {pattern: /yeezy|\byzy\b/i, label: 'Yeezy'},
  {pattern: /comme des gar(c|ç)ons|\bcdg\b/i, label: 'Comme des Garçons'},
];

export function brandFromTitle(
  title: string | null | undefined,
): {label: string; handle?: string} | undefined {
  if (!title) return undefined;
  for (const brand of TITLE_BRANDS) {
    if (brand.pattern.test(title)) {
      return {label: brand.label, handle: brand.handle};
    }
  }
  return undefined;
}

/**
 * Title → the `brand:<slug>` tag written on every product. MUST mirror the
 * patterns used by the bulk-tagging job, first match wins (collabs above
 * their parent house).
 */
const TAG_BRANDS: Array<[RegExp, string]> = [
  [/jordan|jumpman/i, 'jordan'],
  [/travis scott|cactus jack/i, 'travis-scott'],
  [/nike|nocta|nikecraft|\bdunk\b|air force 1|air max|vomero|\bp-6000\b|cortez/i, 'nike'],
  [/new balance/i, 'new-balance'],
  [/asics/i, 'asics'],
  [/adidas|samba|spezial|gazelle|campus|superstar/i, 'adidas'],
  [/\bugg\b/i, 'ugg'],
  [/essential|fear of god/i, 'essentials'],
  [/stussy|stüssy/i, 'stussy'],
  [/corteiz|crtz/i, 'corteiz'],
  [/syna/i, 'syna-world'],
  [/represent/i, 'represent'],
  // "Ami White Zipper". \bami\b: New Balance "Aminé" and "Miami" never match.
  [/\bami\b|ami de c(?:oe|œ)ur/i, 'ami-paris'],
  [/denim tears|denim trs/i, 'denim-tears'],
  [/sp5der|spyder/i, 'sp5der'],
  [/gallery/i, 'gallery-dept'],
  [/supreme/i, 'supreme'],
  [/timberland/i, 'timberland'],
  [/jacquemus/i, 'jacquemus'],
  [/skims/i, 'skims'],
  [/stone island/i, 'stone-island'],
  [/hellstar/i, 'hellstar'],
  [/casablanca/i, 'casablanca'],
  [/\blego\b/i, 'lego'],
  [/maison margiela|mm6/i, 'maison-margiela'],
  [/north face/i, 'north-face'],
  [/palace/i, 'palace'],
  [/umbro/i, 'umbro'],
  [/\bhuf\b/i, 'huf'],
  [/\bkith\b/i, 'kith'],
  [/sacai/i, 'sacai'],
  [/off-white|off white/i, 'off-white'],
  // Mirrors the brands added to scripts/lib/taxonomy.mjs for the import.
  [/vale forever/i, 'vale-forever'],
  [/\bsalomon\b/i, 'salomon'],
  [/\bpuma\b/i, 'puma'],
  [/\bvans\b/i, 'vans'],
  [/\bcrocs\b/i, 'crocs'],
  [/\bconverse\b/i, 'converse'],
  [/\bsaucony\b/i, 'saucony'],
  [/maison mihara|mihara yasuhiro/i, 'maison-mihara-yasuhiro'],
  [/\bhoka\b/i, 'hoka'],
  [/birkenstock/i, 'birkenstock'],
  [/on running/i, 'on-running'],
  [/\breebok\b/i, 'reebok'],
  [/under armour/i, 'under-armour'],
  [/dr\.? martens/i, 'dr-martens'],
  [/onitsuka tiger/i, 'onitsuka-tiger'],
  [/\bbape\b|a bathing ape/i, 'bape'],
  [/\bvlone\b/i, 'vlone'],
  [/godspeed/i, 'godspeed'],
  [/yeezy|\byzy\b/i, 'yeezy'],
  [/comme des gar(c|ç)ons|\bcdg\b/i, 'comme-des-garcons'],
];

export function brandTagSlug(title: string | null | undefined): string | null {
  if (!title) return null;
  for (const [pattern, slug] of TAG_BRANDS) {
    if (pattern.test(title)) return slug;
  }
  return null;
}

/**
 * Big-shop display split: a bold brand line + a cleaner product name
 * ("Nike Dunk Low Panda" → brand "Nike", rest "Dunk Low Panda"). When the
 * detected brand isn't a literal prefix of the title, the title is kept
 * whole so nothing meaningful is lost.
 */
export function splitBrandTitle(title: string): {
  brand?: string;
  rest: string;
} {
  const brand = brandFromTitle(title)?.label;
  if (!brand) return {rest: title};
  const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rest = title.replace(new RegExp(`^${escaped}\\s+`, 'i'), '');
  return {brand, rest: rest || title};
}

export interface ScopedLinkGroup {
  /** Sidebar section heading, e.g. "Brands on sale" or "Nike models". */
  heading: string;
  links: Array<{label: string; handle: string}>;
}

/**
 * Context-aware links for the filter sidebar: instead of always listing the
 * whole catalog's brands, each collection gets links scoped to itself —
 * Sale links to brand-on-sale collections, brand pages list their models,
 * Men lists men's subcategories. Falls back to BRAND_LINKS elsewhere.
 */
export const SCOPED_FILTER_LINKS: Record<string, ScopedLinkGroup> = {
  sale: {
    heading: 'Brands on sale',
    links: [
      {label: 'All Sale', handle: 'sale'},
      {label: 'Nike Sale', handle: 'sale-nike'},
      {label: 'New Balance Sale', handle: 'sale-new-balance'},
      {label: 'ASICS Sale', handle: 'sale-asics'},
      {label: 'Essentials Sale', handle: 'sale-essentials'},
      {label: 'Women Sale', handle: 'sale-women'},
    ],
  },
  women: {
    heading: 'Women’s categories',
    links: [
      {label: 'Sneakers', handle: 'women-sneakers'},
      {label: 'Boots', handle: 'women-boots'},
      {label: 'Slippers & Slides', handle: 'women-slippers'},
      {label: 'Tops', handle: 'women-tops'},
      {label: 'Pants & Leggings', handle: 'women-pants'},
      {label: 'Flared Denim', handle: 'flare-jeans'},
      {label: 'UGG', handle: 'ugg-boots-slippers'},
    ],
  },
  nike: {
    heading: 'Nike models',
    links: [
      {label: 'Dunk', handle: 'nike-dunk'},
      {label: 'Air Force 1', handle: 'nike-air-force-1'},
      {label: 'Air Max', handle: 'nike-air-max'},
      {label: 'Zoom Vomero', handle: 'nike-zoom-vomero'},
      {label: 'P-6000', handle: 'nike-p-6000'},
      {label: 'Shox', handle: 'nike-shox'},
      {label: 'Nike x NOCTA', handle: 'nike-nocta'},
      {label: 'Travis Scott', handle: 'travis-scott-sneakers'},
    ],
  },
  jordan: {
    heading: 'Jordan models',
    links: [
      {label: 'Air Jordan 1', handle: 'air-jordan-1'},
      {label: 'Air Jordan 4', handle: 'air-jordan-4'},
      {label: 'Jumpman Jack', handle: 'jumpman-jack'},
    ],
  },
  'new-balance': {
    heading: 'New Balance models',
    links: [
      {label: '9060', handle: 'new-balance-9060'},
      {label: '1906', handle: 'new-balance-1906'},
      {label: '2002R', handle: 'new-balance-2002r'},
      {label: '550', handle: 'new-balance-550'},
      {label: '530', handle: 'new-balance-530'},
    ],
  },
  asics: {
    heading: 'ASICS models',
    links: [
      {label: 'Gel-NYC', handle: 'asics-gel-nyc'},
      {label: 'Gel-Kayano', handle: 'asics-gel-kayano'},
      {label: 'Gel-1130', handle: 'asics-gel-1130'},
    ],
  },
  adidas: {
    heading: 'adidas models',
    links: [
      {label: 'Samba', handle: 'adidas-samba'},
      {label: 'Handball Spezial', handle: 'adidas-spezial'},
    ],
  },
  essentials: {
    heading: 'Essentials range',
    links: [
      {label: 'Summer Collection', handle: 'essentials-summer'},
      {label: 'Winter Collection', handle: 'essentials-winter'},
      {label: 'T-Shirts', handle: 'essentials-t-shirts'},
      {label: 'Hoodies', handle: 'essentials-hoodies'},
      {label: 'Shorts', handle: 'essentials-shorts'},
      {label: 'Pants', handle: 'essentials-pants'},
      {label: 'Jackets', handle: 'essentials-jackets'},
      {label: 'Sets', handle: 'essentials-sets'},
    ],
  },
  men: {
    heading: 'Men’s categories',
    links: [
      {label: 'T-Shirts', handle: 'men-t-shirts'},
      {label: 'Hoodies & Sweatshirts', handle: 'men-hoodies'},
      {label: 'Jackets & Outerwear', handle: 'men-jackets-outerwear'},
      {label: 'Pants & Jeans', handle: 'men-pants-jeans'},
      {label: 'Shorts', handle: 'men-shorts'},
      {label: 'Tracksuits & Sets', handle: 'men-tracksuits-sets'},
    ],
  },
  kids: {
    heading: 'Kids sizes',
    links: [
      {label: 'Grade School (GS)', handle: 'kids-gs'},
      {label: 'Pre-School (PS)', handle: 'kids-ps'},
      {label: 'Toddler (TD)', handle: 'kids-td'},
    ],
  },
};

/**
 * Handle → group index. Every member collection inherits its parent group,
 * so e.g. /collections/sale-nike still shows "Brands on sale" (with Nike
 * active) instead of falling back to the whole catalog — you stay inside
 * the sale. Parents keep their own group; first parent wins for handles
 * shared between groups.
 */
const SCOPE_INDEX: Record<string, ScopedLinkGroup> = {};
for (const [parent, group] of Object.entries(SCOPED_FILTER_LINKS)) {
  SCOPE_INDEX[parent] = group;
}
for (const group of Object.values(SCOPED_FILTER_LINKS)) {
  for (const link of group.links) {
    if (!(link.handle in SCOPE_INDEX)) SCOPE_INDEX[link.handle] = group;
  }
}

export function scopedLinksFor(
  handle: string,
): ScopedLinkGroup | undefined {
  return SCOPE_INDEX[handle];
}

export const BRAND_LINKS: Array<{label: string; handle: string}> = [
  // Roughly by catalogue depth, so the biggest houses lead.
  {label: 'Nike', handle: 'nike'},
  {label: 'Jordan', handle: 'jordan'},
  {label: 'New Balance', handle: 'new-balance'},
  {label: 'adidas', handle: 'adidas'},
  {label: 'UGG', handle: 'ugg-boots-slippers'},
  {label: 'ASICS', handle: 'asics'},
  {label: 'Fear of God Essentials', handle: 'essentials'},
  {label: 'Supreme', handle: 'supreme'},
  {label: 'Yeezy', handle: 'yeezy'},
  {label: 'Travis Scott', handle: 'travis-scott'},
  {label: 'Salomon', handle: 'salomon'},
  {label: 'Stussy', handle: 'stussy'},
  {label: 'Sp5der', handle: 'sp5der'},
  {label: 'Denim Tears', handle: 'denim-tears'},
  {label: 'Puma', handle: 'puma'},
  {label: 'Vans', handle: 'vans'},
  {label: 'Jacquemus', handle: 'jacquemus'},
  {label: 'Crocs', handle: 'crocs'},
  {label: 'Converse', handle: 'converse'},
  {label: 'Maison Mihara Yasuhiro', handle: 'maison-mihara-yasuhiro'},
  {label: 'Saucony', handle: 'saucony'},
  {label: 'On Running', handle: 'on-running'},
  {label: 'BAPE', handle: 'bape'},
  {label: 'Vale Forever', handle: 'vale-forever'},
  {label: 'Comme des Garçons', handle: 'comme-des-garcons'},
  {label: 'Gallery Dept', handle: 'gallery-dept'},
  {label: 'Godspeed', handle: 'godspeed'},
  {label: 'Hellstar', handle: 'hellstar'},
  {label: 'HOKA', handle: 'hoka'},
  {label: 'Vlone', handle: 'vlone'},
  {label: 'Birkenstock', handle: 'birkenstock'},
  {label: 'Syna World', handle: 'syna-world'},
  {label: 'Timberland', handle: 'timberland'},
  {label: 'Corteiz', handle: 'corteiz'},
];
