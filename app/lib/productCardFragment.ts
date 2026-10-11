import type {ProductCardFragment} from 'storefrontapi.generated';

/**
 * Shared product-card fragment used by every product grid (collections,
 * catalog, homepage rails, search, favorites, recommendations).
 *
 * Includes `options` + `quickAddVariants` so cards can offer one-tap
 * "quick add" with a real size picker — shoppers add the right variant to
 * the basket without opening the product page. 24 variants covers the
 * largest products in the catalog (EU-sized sneakers ≈ 21 variants) while
 * keeping listing payloads light.
 */
export const PRODUCT_CARD_FRAGMENT = `#graphql
  fragment ProductCardMoney on MoneyV2 {
    amount
    currencyCode
  }
  fragment ProductCard on Product {
    id
    handle
    title
    vendor
    # Carried on every card so the bestseller badge can be derived from the
    # PRODUCT rather than from whichever rail happens to be rendering it —
    # otherwise the same shoe is a bestseller in one row and not in the next.
    tags
    featuredImage {
      id
      altText
      url
      width
      height
    }
    # Extra shots so cards can be flipped through without opening the product
    images(first: 5) {
      nodes {
        id
        altText
        url
        width
        height
      }
    }
    priceRange {
      minVariantPrice {
        ...ProductCardMoney
      }
      maxVariantPrice {
        ...ProductCardMoney
      }
    }
    compareAtPriceRange {
      minVariantPrice {
        ...ProductCardMoney
      }
    }
    firstVariant: selectedOrFirstAvailableVariant(
      selectedOptions: []
      ignoreUnknownOptions: true
      caseInsensitiveMatch: true
    ) {
      id
      availableForSale
      price {
        ...ProductCardMoney
      }
      compareAtPrice {
        ...ProductCardMoney
      }
    }
    options {
      name
      optionValues {
        name
      }
    }
    quickAddVariants: variants(first: 24) {
      nodes {
        id
        title
        availableForSale
        image {
          id
          altText
          url
          width
          height
        }
        selectedOptions {
          name
          value
        }
        price {
          ...ProductCardMoney
        }
        compareAtPrice {
          ...ProductCardMoney
        }
      }
    }
  }
` as const;

/*
 * --------------------------------------------------
 * Packed variants
 * --------------------------------------------------
 *
 * Quick add needs every variant of every card, and as the Storefront API
 * returns them that is ~200 bytes each once serialised into the page for
 * hydration: an object with seven keys, a `selectedOptions` array of more
 * objects, two money objects, a 50-character gid. At ~15 variants a card and
 * ~75 cards, the homepage carried roughly 300 KB of it — more than all of its
 * visible markup — and the browser has to parse that before React can start.
 *
 * Nearly all of it is repetition: every variant of a product shares the
 * option NAMES, the currency, the gid prefix and (one colourway per product)
 * the picture. So listing loaders send one short row per variant instead and
 * the card rebuilds the full shape in the browser with `cardVariants()`.
 * Nothing downstream changes: QuickAdd and ProductItem still work on the same
 * `QuickAddVariant` objects they always did.
 */
const VARIANT_GID = 'gid://shopify/ProductVariant/';

type CardImage = {
  id?: string | null;
  altText?: string | null;
  url: string;
  width?: number | null;
  height?: number | null;
};

/**
 * One variant: [id without the gid prefix, available, option values in the
 * order of `product.options`, price, compare-at price, own image].
 * The image is only kept when it differs from the product's featured image.
 */
export type PackedVariant = [
  id: string,
  available: 0 | 1,
  values: string[],
  price: string,
  compareAt: string | null,
  image: CardImage | null,
];

export type PackedVariants = {currency: string; rows: PackedVariant[]};

export type PackedProductCard = Omit<ProductCardFragment, 'quickAddVariants'> & {
  quickAddVariants?: null;
  packedVariants: PackedVariants;
};

/** What a card component may be handed: straight from the API, or packed. */
export type AnyProductCard = ProductCardFragment | PackedProductCard;

type UnpackedVariant = ProductCardFragment['quickAddVariants']['nodes'][number];

/** Server side: swap `quickAddVariants` for the packed rows. */
export function packCard(card: ProductCardFragment): PackedProductCard {
  const {quickAddVariants, ...rest} = card;
  const variants = quickAddVariants?.nodes ?? [];
  const featured = card.featuredImage?.url;
  const optionNames = (card.options ?? []).map((option) => option.name);
  const rows = variants.map((variant): PackedVariant => {
    const id = variant.id.startsWith(VARIANT_GID)
      ? variant.id.slice(VARIANT_GID.length)
      : variant.id;
    return [
      id,
      variant.availableForSale ? 1 : 0,
      optionNames.map(
        (name) =>
          variant.selectedOptions.find((selected) => selected.name === name)
            ?.value ?? '',
      ),
      variant.price.amount,
      variant.compareAtPrice?.amount ?? null,
      variant.image?.url && variant.image.url !== featured
        ? variant.image
        : null,
    ];
  });
  const currency =
    variants[0]?.price.currencyCode ??
    card.priceRange.minVariantPrice.currencyCode;
  return {...rest, quickAddVariants: null, packedVariants: {currency, rows}};
}

/** Browser (and SSR) side: the variants of a card, whichever way it came. */
export function cardVariants<V = UnpackedVariant>(card: {
  options?: Array<{name: string}> | null;
  quickAddVariants?: {nodes: V[]} | null;
  packedVariants?: PackedVariants | null;
}): V[] {
  const packed = card.packedVariants;
  if (!packed) return card.quickAddVariants?.nodes ?? [];
  const optionNames = (card.options ?? []).map((option) => option.name);
  const currencyCode = packed.currency as UnpackedVariant['price']['currencyCode'];
  const rows: UnpackedVariant[] = packed.rows.map(
    ([id, available, values, price, compareAt, image]) => ({
    id: /^\d+$/.test(id) ? `${VARIANT_GID}${id}` : id,
    title: values.filter(Boolean).join(' / '),
    availableForSale: available === 1,
    image: (image ?? null) as UnpackedVariant['image'],
    selectedOptions: optionNames.map((name, index) => ({
      name,
      value: values[index] ?? '',
    })),
    price: {amount: price, currencyCode},
    compareAtPrice: compareAt ? {amount: compareAt, currencyCode} : null,
  }),
  );
  // Callers type their variants more loosely than the generated fragment
  // (QuickAdd keeps currency as a plain string); the runtime shape is one.
  return rows as unknown as V[];
}
