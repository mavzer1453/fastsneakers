import {useEffect, useMemo, useState, useSyncExternalStore} from 'react';
import {useRouteLoaderData} from 'react-router';
import type {CustomerAccount} from '@shopify/hydrogen';
import {
  CUSTOMER_WISHLIST_QUERY,
  SET_CUSTOMER_WISHLIST_MUTATION,
} from '~/graphql/customer-account/CustomerWishlist';
import {
  getGuestFavoritesServerSnapshot,
  getGuestFavoritesSnapshot,
  subscribeGuestFavorites,
} from '~/lib/guestWishlist';

/**
 * Customer wishlist ("favorites") backed by a customer metafield.
 *
 * The list of favorited product IDs is stored on the logged-in customer in the
 * `custom.wishlist` metafield (`list.product_reference`), so favorites persist
 * across devices and sessions. Requires the metafield definition to exist in
 * Shopify admin with Customer Account API read+write access — see
 * SHOPIFY_SETUP.md.
 */
const WISHLIST_METAFIELD_NAMESPACE = 'custom';
const WISHLIST_METAFIELD_KEY = 'wishlist';

function parseWishlistValue(value?: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : [];
  } catch {
    return [];
  }
}

/**
 * Returns the logged-in customer's favorited product IDs. Resolves to an empty
 * array when the shopper is signed out or on any error, so it is safe to
 * stream from the root loader on every request.
 */
export async function getWishlistIds(
  customerAccount: CustomerAccount,
): Promise<string[]> {
  try {
    const loggedIn = await customerAccount.isLoggedIn();
    if (!loggedIn) return [];

    const {data} = await customerAccount.query(CUSTOMER_WISHLIST_QUERY);
    return parseWishlistValue(data?.customer?.wishlist?.value);
  } catch {
    return [];
  }
}

async function writeWishlist(
  customerAccount: CustomerAccount,
  customerId: string,
  next: string[],
): Promise<void> {
  const {data: mutationData} = await customerAccount.mutate(
    SET_CUSTOMER_WISHLIST_MUTATION,
    {
      variables: {
        metafields: [
          {
            ownerId: customerId,
            namespace: WISHLIST_METAFIELD_NAMESPACE,
            key: WISHLIST_METAFIELD_KEY,
            type: 'list.product_reference',
            value: JSON.stringify(next),
          },
        ],
      },
    },
  );

  const userErrors = mutationData?.metafieldsSet?.userErrors ?? [];
  if (userErrors.length > 0) {
    // Most common cause: the `custom.wishlist` metafield definition is missing
    // or lacks Customer Account API write access (see SHOPIFY_SETUP.md).
    throw new Error(userErrors[0]?.message ?? 'Could not update favorites.');
  }
}

/**
 * Toggles one product in the signed-in customer's wishlist.
 * One query (customer id + current list) + one mutation, and surfaces
 * `metafieldsSet` userErrors instead of swallowing them.
 */
export async function toggleWishlistProduct(
  customerAccount: CustomerAccount,
  productId: string,
  currentlyFavorite: boolean,
): Promise<string[]> {
  const {data} = await customerAccount.query(CUSTOMER_WISHLIST_QUERY);
  const customerId = data?.customer?.id;
  if (!customerId) {
    throw new Error('Cannot update wishlist: no signed-in customer.');
  }

  const ids = parseWishlistValue(data?.customer?.wishlist?.value);
  const next = currentlyFavorite
    ? ids.filter((id) => id !== productId)
    : Array.from(new Set([...ids, productId]));

  await writeWishlist(customerAccount, customerId, next);
  return next;
}

/**
 * Merges on-device favorites into the signed-in customer's wishlist — used
 * to silently sync a guest's hearts into the account after sign-in.
 */
export async function mergeWishlistProducts(
  customerAccount: CustomerAccount,
  productIds: string[],
): Promise<string[]> {
  const {data} = await customerAccount.query(CUSTOMER_WISHLIST_QUERY);
  const customerId = data?.customer?.id;
  if (!customerId) {
    throw new Error('Cannot update wishlist: no signed-in customer.');
  }

  const ids = parseWishlistValue(data?.customer?.wishlist?.value);
  const next = Array.from(new Set([...ids, ...productIds]));
  if (next.length === ids.length) return ids;

  await writeWishlist(customerAccount, customerId, next);
  return next;
}

type RootWishlistData = {
  favorites?: Promise<string[]> | string[];
  isLoggedIn?: Promise<boolean> | boolean;
};

/**
 * Client hook returning the shopper's favorited product IDs as a Set — the
 * union of the account wishlist (streamed from the root loader) and the
 * on-device guest favorites, so hearts work with or without an account.
 */
export function useWishlist(): Set<string> {
  const root = useRouteLoaderData('root') as RootWishlistData | undefined;
  const favorites = root?.favorites;
  const [ids, setIds] = useState<string[]>(() =>
    Array.isArray(favorites) ? favorites : [],
  );

  const guestIds = useSyncExternalStore(
    subscribeGuestFavorites,
    getGuestFavoritesSnapshot,
    getGuestFavoritesServerSnapshot,
  );

  useEffect(() => {
    let active = true;
    if (!favorites) {
      setIds([]);
    } else if (Array.isArray(favorites)) {
      setIds(favorites);
    } else {
      favorites
        .then((value) => {
          if (active) setIds(value);
        })
        .catch(() => {
          if (active) setIds([]);
        });
    }
    return () => {
      active = false;
    };
  }, [favorites]);

  return useMemo(() => new Set([...ids, ...guestIds]), [ids, guestIds]);
}

/** The guest (on-device) favorite ids, reactive across components. */
export function useGuestWishlist(): string[] {
  return useSyncExternalStore(
    subscribeGuestFavorites,
    getGuestFavoritesSnapshot,
    getGuestFavoritesServerSnapshot,
  );
}

/**
 * Resolves the root loader's deferred `isLoggedIn` promise into state.
 * Returns `undefined` while unresolved, then `true`/`false`.
 */
export function useIsLoggedIn(): boolean | undefined {
  const root = useRouteLoaderData('root') as RootWishlistData | undefined;
  const value = root?.isLoggedIn;
  const [loggedIn, setLoggedIn] = useState<boolean | undefined>(
    typeof value === 'boolean' ? value : undefined,
  );

  useEffect(() => {
    let active = true;
    if (typeof value === 'boolean') {
      setLoggedIn(value);
    } else if (value) {
      value
        .then((resolved) => {
          if (active) setLoggedIn(resolved);
        })
        .catch(() => {
          if (active) setLoggedIn(false);
        });
    }
    return () => {
      active = false;
    };
  }, [value]);

  return loggedIn;
}
