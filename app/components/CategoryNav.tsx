import {NavLink} from 'react-router';
import {useLocalizedHref} from '~/lib/localizedLink';

/**
 * Category rail on a collection page (Zalando-style): the department heading
 * followed by its sibling categories, with the current one highlighted. On
 * mobile it renders as the chip row under the page title.
 *
 * Every collection belongs to exactly one rail, and a rail shows the
 * subcategories of that collection — Essentials shows Essentials categories,
 * Nike shows Nike models, a streetwear brand shows the other brands. Rails are
 * matched most-specific-first (see GROUP_ORDER), so `nike` lands on the Nike
 * rail even though it is also a row on the Sneakers rail.
 *
 * Every handle below is a real collection in Shopify. Adding a row for a
 * collection that does not exist ships a dead chip, so check before editing.
 */

interface CategoryGroup {
  heading: string;
  links: Array<{label: string; handle: string}>;
}

/* ---------------------------------------------------------------- sneakers */

const NIKE: CategoryGroup = {
  heading: 'Nike',
  links: [
    {label: 'All Nike', handle: 'nike'},
    {label: 'Dunk', handle: 'nike-dunk'},
    {label: 'Air Force 1', handle: 'nike-air-force-1'},
    {label: 'Air Max', handle: 'nike-air-max'},
    {label: 'Zoom Vomero', handle: 'nike-zoom-vomero'},
    {label: 'P-6000', handle: 'nike-p-6000'},
    {label: 'Shox', handle: 'nike-shox'},
    {label: 'Kobe', handle: 'nike-kobe'},
    {label: 'Blazer', handle: 'nike-blazer'},
    {label: 'Nike x NOCTA', handle: 'nike-nocta'},
    {label: 'Nike x Off-White', handle: 'nike-off-white'},
    {label: 'Nike x sacai', handle: 'nike-sacai'},
    {label: 'Nike x Supreme', handle: 'nike-supreme'},
    {label: 'Nike x Travis Scott', handle: 'travis-scott-sneakers'},
    {label: 'Nike Sale', handle: 'sale-nike'},
  ],
};

const JORDAN: CategoryGroup = {
  heading: 'Jordan',
  links: [
    {label: 'All Jordan', handle: 'jordan'},
    {label: 'Air Jordan 1', handle: 'air-jordan-1'},
    {label: 'Air Jordan 3', handle: 'air-jordan-3'},
    {label: 'Air Jordan 4', handle: 'air-jordan-4'},
    {label: 'Air Jordan 5', handle: 'air-jordan-5'},
    {label: 'Air Jordan 6', handle: 'air-jordan-6'},
    {label: 'Air Jordan 11', handle: 'air-jordan-11'},
    {label: 'Jumpman Jack', handle: 'jumpman-jack'},
  ],
};

/* --------------------------------------------------------------- sub-models */

/**
 * A third level, for the model lines big enough to split. Landing on one of
 * these rails means the shopper is inside a single silhouette, so the rail
 * shows its variants and a way back up to the line.
 *
 * Only lines that genuinely divide get one. Air Force 1 deliberately has no
 * rail: 383 of its 439 products are Low, so the split would be one real row
 * and two empty ones.
 */
const NIKE_DUNK: CategoryGroup = {
  heading: 'Nike Dunk',
  links: [
    {label: 'All Dunk', handle: 'nike-dunk'},
    {label: 'Dunk Low', handle: 'nike-dunk-low'},
    {label: 'Dunk High', handle: 'nike-dunk-high'},
    {label: 'SB Dunk', handle: 'nike-dunk-sb'},
    {label: 'All Nike', handle: 'nike'},
  ],
};

const NIKE_AIR_MAX: CategoryGroup = {
  heading: 'Nike Air Max',
  links: [
    {label: 'All Air Max', handle: 'nike-air-max'},
    {label: 'Air Max 1', handle: 'nike-air-max-1'},
    {label: 'Air Max 90', handle: 'nike-air-max-90'},
    {label: 'Air Max 95', handle: 'nike-air-max-95'},
    {label: 'Air Max Plus (TN)', handle: 'nike-air-max-plus'},
    {label: 'All Nike', handle: 'nike'},
  ],
};

const AIR_JORDAN_1: CategoryGroup = {
  heading: 'Air Jordan 1',
  links: [
    {label: 'All Jordan 1', handle: 'air-jordan-1'},
    {label: 'Jordan 1 High', handle: 'air-jordan-1-high'},
    {label: 'Jordan 1 Mid', handle: 'air-jordan-1-mid'},
    {label: 'Jordan 1 Low', handle: 'air-jordan-1-low'},
    {label: 'All Jordan', handle: 'jordan'},
  ],
};

const UGG: CategoryGroup = {
  heading: 'UGG',
  links: [
    {label: 'All UGG', handle: 'ugg-boots-slippers'},
    {label: 'Tasman', handle: 'ugg-tasman'},
    {label: 'Classic Ultra Mini', handle: 'ugg-classic-ultra-mini'},
    {label: 'Boots', handle: 'boots'},
    {label: 'Slippers & slides', handle: 'slippers'},
  ],
};

const NEW_BALANCE: CategoryGroup = {
  heading: 'New Balance',
  links: [
    {label: 'All New Balance', handle: 'new-balance'},
    {label: '9060', handle: 'new-balance-9060'},
    {label: '1906', handle: 'new-balance-1906'},
    {label: '2002R', handle: 'new-balance-2002r'},
    {label: '550', handle: 'new-balance-550'},
    {label: '530', handle: 'new-balance-530'},
    {label: '740', handle: 'new-balance-740'},
    {label: 'New Balance Sale', handle: 'sale-new-balance'},
  ],
};

const ASICS: CategoryGroup = {
  heading: 'ASICS',
  links: [
    {label: 'All ASICS', handle: 'asics'},
    {label: 'Gel-NYC', handle: 'asics-gel-nyc'},
    {label: 'Gel-Kayano', handle: 'asics-gel-kayano'},
    {label: 'Gel-1130', handle: 'asics-gel-1130'},
    {label: 'ASICS Sale', handle: 'sale-asics'},
  ],
};

const ADIDAS: CategoryGroup = {
  heading: 'adidas',
  links: [
    {label: 'All adidas', handle: 'adidas'},
    {label: 'Samba', handle: 'adidas-samba'},
    {label: 'Gazelle', handle: 'adidas-gazelle'},
    {label: 'Campus', handle: 'adidas-campus'},
    {label: 'Handball Spezial', handle: 'adidas-spezial'},
    {label: 'Superstar', handle: 'adidas-superstar'},
  ],
};

const SNEAKERS: CategoryGroup = {
  heading: 'Sneakers',
  links: [
    {label: 'All sneakers', handle: 'sneakers'},
    // Footwear types that aren't sneakers but live in the same collection.
    {label: 'Boots', handle: 'boots'},
    {label: 'Slippers & slides', handle: 'slippers'},
    {label: 'Nike', handle: 'nike'},
    {label: 'Jordan', handle: 'jordan'},
    {label: 'New Balance', handle: 'new-balance'},
    {label: 'ASICS', handle: 'asics'},
    {label: 'adidas', handle: 'adidas'},
    {label: 'On Running', handle: 'on-running'},
    {label: 'Puma', handle: 'puma'},
    {label: 'Salomon', handle: 'salomon'},
    {label: 'Vans', handle: 'vans'},
    {label: 'Converse', handle: 'converse'},
    {label: 'Crocs', handle: 'crocs'},
    {label: 'Yeezy', handle: 'yeezy'},
    {label: 'Timberland', handle: 'timberland'},
    {label: 'Birkenstock', handle: 'birkenstock'},
    {label: 'Travis Scott', handle: 'travis-scott-sneakers'},
    {label: 'UGG', handle: 'ugg-boots-slippers'},
    {label: 'Kids sizes', handle: 'kids'},
    {label: 'Sale', handle: 'sale'},
  ],
};

/* ---------------------------------------------------------------- clothing */

const ESSENTIALS: CategoryGroup = {
  heading: 'Essentials',
  links: [
    {label: 'All Essentials', handle: 'essentials'},
    {label: 'Hoodies', handle: 'essentials-hoodies'},
    {label: 'T-shirts', handle: 'essentials-t-shirts'},
    {label: 'Sets', handle: 'essentials-sets'},
    {label: 'Pants', handle: 'essentials-pants'},
    {label: 'Shorts', handle: 'essentials-shorts'},
    {label: 'Jackets', handle: 'essentials-jackets'},
    {label: 'Summer', handle: 'essentials-summer'},
    {label: 'Winter', handle: 'essentials-winter'},
    {label: 'Essentials Sale', handle: 'sale-essentials'},
  ],
};

const MEN: CategoryGroup = {
  heading: 'Men',
  links: [
    {label: 'All men', handle: 'men'},
    {label: 'Sneakers', handle: 'men-sneakers'},
    {label: 'T-shirts', handle: 'men-t-shirts'},
    {label: 'Hoodies & sweatshirts', handle: 'men-hoodies'},
    {label: 'Jackets & outerwear', handle: 'men-jackets-outerwear'},
    {label: 'Pants & jeans', handle: 'men-pants-jeans'},
    {label: 'Shorts', handle: 'men-shorts'},
    {label: 'Tracksuits & sets', handle: 'men-tracksuits-sets'},
    {label: 'Accessories', handle: 'accessories'},
    {label: 'Sale', handle: 'sale'},
  ],
};

const WOMEN: CategoryGroup = {
  heading: 'Women',
  links: [
    {label: 'All women', handle: 'women'},
    {label: 'Sneakers', handle: 'women-sneakers'},
    {label: 'Boots', handle: 'women-boots'},
    {label: 'Slippers & slides', handle: 'women-slippers'},
    {label: 'Clothing', handle: 'women-clothing'},
    {label: 'Bags', handle: 'women-bags'},
    {label: 'Flared denim', handle: 'flare-jeans'},
    {label: 'UGG', handle: 'ugg-boots-slippers'},
    {label: 'Sale', handle: 'sale-women'},
  ],
};

const KIDS: CategoryGroup = {
  heading: 'Kids',
  links: [
    {label: 'All kids', handle: 'kids'},
    {label: 'Grade school (GS)', handle: 'kids-gs'},
    {label: 'Pre-school (PS)', handle: 'kids-ps'},
    {label: 'Toddler (TD)', handle: 'kids-td'},
    {label: 'Size guide', handle: ''},
  ],
};

/**
 * Garment breakdown for the streetwear brands with enough depth to split.
 * Landing on Supreme should offer Supreme's own categories, not a list of
 * other brands.
 */
const SUPREME: CategoryGroup = {
  heading: 'Supreme',
  links: [
    {label: 'All Supreme', handle: 'supreme'},
    {label: 'T-Shirts', handle: 'supreme-t-shirts'},
    {label: 'Hoodies', handle: 'supreme-hoodies'},
    {label: 'Jackets', handle: 'supreme-jackets'},
    {label: 'Pants', handle: 'supreme-pants'},
    {label: 'Accessories', handle: 'supreme-accessories'},
  ],
};

const STUSSY: CategoryGroup = {
  heading: 'Stussy',
  links: [
    {label: 'All Stussy', handle: 'stussy'},
    {label: 'T-Shirts', handle: 'stussy-t-shirts'},
    {label: 'Hoodies', handle: 'stussy-hoodies'},
    // No Shirts row: /collections/stussy-shirts does not exist (404).
  ],
};

const SP5DER: CategoryGroup = {
  heading: 'Sp5der',
  links: [
    {label: 'All Sp5der', handle: 'sp5der'},
    {label: 'Hoodies', handle: 'sp5der-hoodies'},
    {label: 'T-Shirts', handle: 'sp5der-t-shirts'},
    {label: 'Pants', handle: 'sp5der-pants'},
  ],
};

const JACQUEMUS: CategoryGroup = {
  heading: 'Jacquemus',
  links: [
    {label: 'All Jacquemus', handle: 'jacquemus'},
    {label: 'Le Grand Bambino', handle: 'jacquemus-le-grand-bambino'},
    {label: 'Le Bambino', handle: 'jacquemus-le-bambino'},
    {label: 'Le Long Bambino', handle: 'jacquemus-le-long-bambino'},
    {label: 'Croco', handle: 'jacquemus-croco'},
    {label: 'All bags', handle: 'bags'},
  ],
};

const ACCESSORIES: CategoryGroup = {
  heading: 'Accessories',
  links: [
    {label: 'All accessories', handle: 'accessories'},
    {label: 'Bags', handle: 'bags'},
    {label: 'Shoelaces', handle: 'shoelaces'},
    {label: 'Caps & hats', handle: 'caps-hats'},
    {label: 'Jacquemus', handle: 'jacquemus'},
  ],
};

const DENIM_TEARS: CategoryGroup = {
  heading: 'Denim Tears',
  links: [
    {label: 'All Denim Tears', handle: 'denim-tears'},
    {label: 'Pants', handle: 'denim-tears-pants'},
    {label: 'Hoodies', handle: 'denim-tears-hoodies'},
    {label: 'Shorts', handle: 'denim-tears-shorts'},
  ],
};

/** Streetwear labels — from one brand page you hop to the next. */
const BRANDS: CategoryGroup = {
  heading: 'Brands',
  links: [
    {label: 'Essentials', handle: 'essentials'},
    {label: 'Stussy', handle: 'stussy'},
    {label: 'Corteiz', handle: 'corteiz'},
    {label: 'Syna World', handle: 'syna-world'},
    {label: 'Travis Scott', handle: 'travis-scott'},
    {label: 'Denim Tears', handle: 'denim-tears'},
    {label: 'Gallery Dept', handle: 'gallery-dept'},
    {label: 'Represent', handle: 'represent'},
    {label: 'NOCTA', handle: 'nocta'},
    {label: 'AMI Paris', handle: 'ami-paris'},
    {label: 'Sp5der', handle: 'sp5der'},
    {label: 'Supreme', handle: 'supreme'},
    {label: 'Jacquemus', handle: 'jacquemus'},
    {label: 'Vale Forever', handle: 'vale-forever'},
    {label: 'Hellstar', handle: 'hellstar'},
    {label: 'Vlone', handle: 'vlone'},
    {label: 'Godspeed', handle: 'godspeed'},
    {label: 'BAPE', handle: 'bape'},
  ],
};

/** Catalog-wide clothing categories, not scoped to a department. */
const CLOTHING: CategoryGroup = {
  heading: 'Clothing',
  links: [
    {label: 'All clothing', handle: 'clothing'},
    {label: 'T-shirts', handle: 't-shirts'},
    {label: 'Hoodies & sweatshirts', handle: 'hoodies-sweatshirts'},
    {label: 'Jackets & outerwear', handle: 'jackets-outerwear'},
    {label: 'Pants & shorts', handle: 'pants-shorts'},
    {label: 'Sets & tracksuits', handle: 'sets-tracksuits'},
    {label: 'Accessories', handle: 'accessories'},
    {label: 'Essentials', handle: 'essentials'},
    {label: 'Supreme', handle: 'supreme'},
    {label: 'Stussy', handle: 'stussy'},
    {label: 'Sp5der', handle: 'sp5der'},
    {label: 'Sale', handle: 'sale'},
  ],
};

const SALE: CategoryGroup = {
  heading: 'Sale',
  links: [
    {label: 'All sale', handle: 'sale'},
    {label: 'Nike', handle: 'sale-nike'},
    {label: 'New Balance', handle: 'sale-new-balance'},
    {label: 'ASICS', handle: 'sale-asics'},
    {label: 'Essentials', handle: 'sale-essentials'},
    {label: 'Women', handle: 'sale-women'},
  ],
};

/** Rail for the full catalog at /collections/all and /collections/bestsellers. */
const ALL: CategoryGroup = {
  heading: 'All products',
  links: [
    {label: 'Everything', handle: 'all'},
    {label: 'Staff picks', handle: 'bestsellers'},
    {label: 'Sneakers', handle: 'sneakers'},
    {label: 'Essentials', handle: 'essentials'},
    {label: 'Men', handle: 'men'},
    {label: 'Women', handle: 'women'},
    {label: 'Kids', handle: 'kids'},
    {label: 'Sale', handle: 'sale'},
  ],
};

/**
 * Most specific rail first: a handle claims the first group that lists it, so
 * `nike` resolves to the Nike rail rather than to Sneakers, and `sale-nike` to
 * Nike rather than to Sale. Reordering this list changes which rail a page
 * shows — the only place that decision lives.
 */
const GROUP_ORDER: CategoryGroup[] = [
  // Sub-model rails first: `nike-dunk-low` must claim the Dunk rail before
  // NIKE (which lists `nike-dunk`) gets a chance to claim it.
  NIKE_DUNK,
  NIKE_AIR_MAX,
  AIR_JORDAN_1,
  UGG,
  // Brand-with-garments rails claim their handles before the flat BRANDS list.
  SUPREME,
  STUSSY,
  SP5DER,
  DENIM_TEARS,
  JACQUEMUS,
  ACCESSORIES,
  NIKE,
  JORDAN,
  NEW_BALANCE,
  ASICS,
  ADIDAS,
  ESSENTIALS,
  WOMEN,
  KIDS,
  BRANDS,
  // Ahead of the rails that merely link to Sale, so /collections/sale gets the
  // Sale rail. Its brand rows are already claimed above, by design.
  SALE,
  CLOTHING,
  MEN,
  SNEAKERS,
  ALL,
];

const GROUP_BY_HANDLE: Record<string, CategoryGroup> = {};
for (const group of GROUP_ORDER) {
  for (const link of group.links) {
    if (link.handle && !(link.handle in GROUP_BY_HANDLE)) {
      GROUP_BY_HANDLE[link.handle] = group;
    }
  }
}

// Collections that belong to a rail without being one of its rows.
Object.assign(GROUP_BY_HANDLE, {
  'travis-scott-sneakers': SNEAKERS,
  'women-tops': WOMEN,
  // A sneaker brand with no model lines of its own: the Sneakers rail is
  // more use here than the full brand index it would otherwise land on.
  'on-running': SNEAKERS,
  // The brand index itself. It is not a row on its own rail, so without
  // this it would fall through to the Sneakers fallback.
  brands: BRANDS,
  // Footwear brands with no model lines of their own — same reasoning as
  // On Running above: the Sneakers rail is more useful than the brand index.
  saucony: SNEAKERS,
  'maison-mihara-yasuhiro': SNEAKERS,
});

/**
 * The department a collection sits under — the first row of its rail, which
 * is always the "All <department>" entry. Used as the destination for the
 * back control when the shopper landed here cold (search, ad, shared link)
 * and there is no history to go back to.
 */
export function railParent(handle: string): {label: string; handle: string} {
  const group = GROUP_BY_HANDLE[handle] ?? SNEAKERS;
  const first = group.links[0];
  // Already on the department's own page — offer the level above it instead.
  if (!first || first.handle === handle) {
    return {label: 'All products', handle: 'all'};
  }
  return {label: group.heading, handle: first.handle};
}

export function CategoryNav({handle}: {handle: string}) {
  const localize = useLocalizedHref();
  const group = GROUP_BY_HANDLE[handle] ?? SNEAKERS;

  return (
    <aside className="category-nav" aria-label="Categories">
      <h2 className="category-nav-heading">{group.heading}</h2>
      <ul>
        {group.links.map((link) => {
          const to = link.handle
            ? `/collections/${link.handle}`
            : '/pages/size-guide';
          const isCurrent = link.handle === handle;
          return (
            <li key={link.label}>
              <NavLink
                to={localize(to)}
                prefetch="intent"
                className={isCurrent ? 'is-current' : undefined}
                aria-current={isCurrent ? 'page' : undefined}
                end
              >
                {link.label}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
