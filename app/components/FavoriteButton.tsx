import {useEffect, useRef} from 'react';
import {useFetcher} from 'react-router';
import {useIsLoggedIn, useWishlist} from '~/lib/wishlist';
import {
  addGuestFavorite,
  removeGuestFavorite,
  toggleGuestFavorite,
} from '~/lib/guestWishlist';
import {useLocalizedHref} from '~/lib/localizedLink';

function HeartIcon({filled}: {filled: boolean}) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      aria-hidden="true"
    >
      <path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Heart toggle shown on product cards and the product page.
 *
 * - Guests: favorites are saved instantly on this device (localStorage) —
 *   no sign-in required, nothing is lost.
 * - Signed in: favorites sync to the customer account (metafield). If the
 *   account write fails (e.g. the metafield isn't configured in Shopify
 *   admin yet), the favorite still sticks locally as a fallback.
 */
export function FavoriteButton({
  productId,
  title,
}: {
  productId: string;
  title: string;
}) {
  const fetcher = useFetcher<{ok: boolean; error?: string}>();
  const favorites = useWishlist();
  const loggedIn = useIsLoggedIn();
  const localize = useLocalizedHref();

  // Intended next state of the last account submit, so a failed server write
  // can fall back to the on-device store and the heart still "sticks".
  const intentRef = useRef<boolean | null>(null);
  const failed =
    fetcher.state === 'idle' && fetcher.data != null && !fetcher.data.ok;

  useEffect(() => {
    if (!failed || intentRef.current == null) return;
    if (intentRef.current) {
      addGuestFavorite(productId);
    } else {
      removeGuestFavorite(productId);
    }
    intentRef.current = null;
  }, [failed, productId]);

  // Guest mode (also used while the login check is still resolving).
  if (loggedIn !== true) {
    const isFavorite = favorites.has(productId);
    const label = isFavorite
      ? `Remove ${title} from favorites`
      : `Add ${title} to favorites`;
    return (
      <button
        type="button"
        className={`favorite-button favorite-form${
          isFavorite ? ' is-active' : ''
        }`}
        aria-pressed={isFavorite}
        aria-label={label}
        title={
          isFavorite ? 'Saved on this device — sign in to sync' : label
        }
        onClick={() => toggleGuestFavorite(productId)}
      >
        <HeartIcon filled={isFavorite} />
      </button>
    );
  }

  const serverIsFavorite = favorites.has(productId);

  // Optimistically reflect the pending toggle: the form submits the state at
  // click time, so the resulting state is its inverse.
  const isFavorite = fetcher.formData
    ? fetcher.formData.get('favorited') !== 'true'
    : serverIsFavorite;

  const label = isFavorite
    ? `Remove ${title} from favorites`
    : `Add ${title} to favorites`;

  return (
    <fetcher.Form
      method="post"
      action={localize('/favorites')}
      className="favorite-form"
    >
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="favorited" value={String(serverIsFavorite)} />
      <button
        type="submit"
        className={`favorite-button${isFavorite ? ' is-active' : ''}`}
        aria-pressed={isFavorite}
        aria-label={label}
        title={label}
        onClick={() => {
          intentRef.current = !serverIsFavorite;
        }}
      >
        <HeartIcon filled={isFavorite} />
      </button>
    </fetcher.Form>
  );
}
