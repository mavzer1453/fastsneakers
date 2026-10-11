/**
 * Shared `?sort_by=` handling for collection and catalog pages.
 * Values are whitelisted here; anything unknown falls back to the default.
 */

export interface SortOption {
  value: string;
  label: string;
}

/**
 * The sort list shoppers see in the filter bar. "Deals" is not a Storefront
 * sort key — it's handled as a discount filter in the collection loader.
 */
export const SORT_OPTIONS: SortOption[] = [
  {value: 'newest', label: 'New'},
  {value: 'price-ascending', label: 'Lowest price'},
  {value: 'price-descending', label: 'Highest price'},
  {value: 'deals', label: 'Deals'},
];

type ProductCollectionSortKeys =
  | 'BEST_SELLING'
  | 'COLLECTION_DEFAULT'
  | 'CREATED'
  | 'PRICE'
  | 'TITLE';

type ProductSortKeys = 'BEST_SELLING' | 'CREATED_AT' | 'PRICE' | 'TITLE';

/** Sort for `collection.products` (ProductCollectionSortKeys). */
export function parseCollectionSort(url: URL): {
  sortKey: ProductCollectionSortKeys;
  reverse: boolean;
} {
  switch (url.searchParams.get('sort_by')) {
    case 'best-selling':
      return {sortKey: 'BEST_SELLING', reverse: false};
    case 'price-ascending':
      return {sortKey: 'PRICE', reverse: false};
    case 'price-descending':
      return {sortKey: 'PRICE', reverse: true};
    case 'newest':
      return {sortKey: 'CREATED', reverse: true};
    case 'title-ascending':
      return {sortKey: 'TITLE', reverse: false};
    // 'deals' has no Storefront equivalent — the loader filters by discount
    // and keeps the collection's own order underneath.
    default:
      return {sortKey: 'COLLECTION_DEFAULT', reverse: false};
  }
}

/** Sort for the all-products catalog `products` query (ProductSortKeys). */
export function parseCatalogSort(url: URL): {
  sortKey: ProductSortKeys;
  reverse: boolean;
} {
  switch (url.searchParams.get('sort_by')) {
    case 'price-ascending':
      return {sortKey: 'PRICE', reverse: false};
    case 'price-descending':
      return {sortKey: 'PRICE', reverse: true};
    case 'newest':
      return {sortKey: 'CREATED_AT', reverse: true};
    case 'title-ascending':
      return {sortKey: 'TITLE', reverse: false};
    case 'featured':
    case 'best-selling':
    default:
      return {sortKey: 'BEST_SELLING', reverse: false};
  }
}
