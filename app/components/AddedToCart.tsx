import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {Image} from '@shopify/hydrogen';
import {BsBasket3} from 'react-icons/bs';
import type {CurrencyCode} from '@shopify/hydrogen/storefront-api-types';
import {useAside} from '~/components/Aside';

export interface AddedToCartItem {
  title: string;
  vendor?: string | null;
  image?: {
    url: string;
    altText?: string | null;
    width?: number | null;
    height?: number | null;
  } | null;
  price?: {amount: string; currencyCode: CurrencyCode} | null;
}

interface AddedToCartContextValue {
  item: AddedToCartItem | null;
  show: (item: AddedToCartItem) => void;
  close: () => void;
}

const AddedToCartContext = createContext<AddedToCartContextValue | null>(null);

export function AddedToCartProvider({children}: {children: React.ReactNode}) {
  const [item, setItem] = useState<AddedToCartItem | null>(null);
  const value = useMemo(
    () => ({item, show: setItem, close: () => setItem(null)}),
    [item],
  );
  return (
    <AddedToCartContext.Provider value={value}>
      {children}
    </AddedToCartContext.Provider>
  );
}

export function useAddedToCart() {
  const context = useContext(AddedToCartContext);
  if (!context) {
    throw new Error('useAddedToCart must be used within AddedToCartProvider');
  }
  return context;
}

/**
 * Lightweight toast shown after adding a product to the basket.
 * Auto-dismisses after a few seconds; "View basket" opens the cart drawer.
 */
export function AddedToCartToast() {
  const {item, close} = useAddedToCart();
  const {open} = useAside();

  useEffect(() => {
    if (!item) return;
    const timeout = setTimeout(close, 3500);
    return () => clearTimeout(timeout);
  }, [item, close]);

  if (!item) return null;

  return (
    <div className="cart-toast" role="status" aria-live="polite">
      {item.image ? (
        <div className="cart-toast-thumb">
          <Image data={item.image} alt="" sizes="44px" />
        </div>
      ) : (
        <span className="cart-toast-icon" aria-hidden="true">
          <BsBasket3 size={18} />
        </span>
      )}
      <div className="cart-toast-body">
        <strong>Added to your basket</strong>
        <span>{item.title}</span>
      </div>
      <button
        type="button"
        className="cart-toast-btn"
        onClick={() => {
          close();
          open('cart');
        }}
      >
        View basket
      </button>
      <button
        type="button"
        className="cart-toast-close"
        onClick={close}
        aria-label="Dismiss"
      >
        &times;
      </button>
    </div>
  );
}
