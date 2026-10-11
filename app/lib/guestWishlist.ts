/**
 * On-device favorites for guests (and as a fallback while the
 * `custom.wishlist` customer metafield isn't configured in Shopify admin).
 * Backed by localStorage and exposed through a tiny external store so every
 * heart and the header badge update together via `useSyncExternalStore`.
 */

const STORAGE_KEY = 'vespera:favorites';
const EMPTY: string[] = [];

let snapshot: string[] = EMPTY;
let initialized = false;
const listeners = new Set<() => void>();

function init() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    snapshot = Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string')
      : EMPTY;
  } catch {
    snapshot = EMPTY;
  }
}

function persist(next: string[]) {
  snapshot = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private mode/quota) — state still works in-memory.
  }
  listeners.forEach((listener) => listener());
}

export function subscribeGuestFavorites(listener: () => void) {
  init();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getGuestFavoritesSnapshot(): string[] {
  return snapshot;
}

export function getGuestFavoritesServerSnapshot(): string[] {
  return EMPTY;
}

export function toggleGuestFavorite(productId: string) {
  init();
  const set = new Set(snapshot);
  if (set.has(productId)) {
    set.delete(productId);
  } else {
    set.add(productId);
  }
  persist([...set]);
}

export function addGuestFavorite(productId: string) {
  init();
  if (snapshot.includes(productId)) return;
  persist([...snapshot, productId]);
}

export function removeGuestFavorite(productId: string) {
  init();
  if (!snapshot.includes(productId)) return;
  persist(snapshot.filter((id) => id !== productId));
}
