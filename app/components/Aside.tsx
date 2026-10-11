import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import {useId} from 'react';

/** useLayoutEffect in the browser, a no-op on the server (where React would
 *  warn about it and there is no document anyway). */
const useBrowserLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** How many drawers are open right now; <html> carries the class while > 0. */
let openOverlays = 0;

type AsideType = 'search' | 'cart' | 'mobile' | 'closed';
type AsideContextValue = {
  type: AsideType;
  /**
   * `intent` names a place inside the aside to land on, for callers that
   * want to open it somewhere other than its root — today only the mobile
   * menu uses it, to open straight into a department (see HeaderMenu).
   * It is the department's menu title, matched case-insensitively.
   */
  intent: string | null;
  open: (mode: AsideType, intent?: string) => void;
  close: () => void;
  /** Consume the intent so reopening the drawer lands on its root again. */
  clearIntent: () => void;
};

/**
 * A side bar component with Overlay
 * @example
 * ```jsx
 * <Aside type="search" heading="SEARCH">
 *  <input type="search" />
 *  ...
 * </Aside>
 * ```
 */
export function Aside({
  children,
  heading,
  type,
}: {
  children?: React.ReactNode;
  type: AsideType;
  heading: React.ReactNode;
}) {
  const {type: activeType, close} = useAside();
  const expanded = type === activeType;
  const id = useId();

  /*
   * Mirrors "a drawer is open" onto <html> as a class, for the two rules that
   * used to read `html:has(.overlay.expanded)` (scroll lock on phones, hiding
   * the mini-cart popover) — see the note in app.css for why :has() on the
   * root was costing a full-document restyle on every DOM change.
   *
   * It lives here rather than in the provider so the class tracks a drawer
   * that is actually on screen: opening a type that has no <Aside> mounted
   * must not lock the page, exactly as before. A layout effect, so the class
   * lands in the same frame as `.expanded` does.
   */
  useBrowserLayoutEffect(() => {
    if (!expanded) return;
    openOverlays += 1;
    document.documentElement.classList.add('has-open-overlay');
    return () => {
      openOverlays -= 1;
      if (openOverlays <= 0) {
        openOverlays = 0;
        document.documentElement.classList.remove('has-open-overlay');
      }
    };
  }, [expanded]);
  useEffect(() => {
    const abortController = new AbortController();

    if (expanded) {
      document.addEventListener(
        'keydown',
        function handler(event: KeyboardEvent) {
          if (event.key === 'Escape') {
            close();
          }
        },
        {signal: abortController.signal},
      );
    }
    return () => abortController.abort();
  }, [close, expanded]);

  return (
    <div
      aria-modal={expanded || undefined}
      className={`overlay ${expanded ? 'expanded' : ''}`}
      role={expanded ? 'dialog' : undefined}
      aria-labelledby={id}
      aria-hidden={expanded ? undefined : true}
      data-type={type}
    >
      <button className="close-outside" onClick={close} tabIndex={-1} />
      <aside>
        <header>
          <h3 id={id}>{heading}</h3>
          <button className="close reset" onClick={close} aria-label="Close">
            &times;
          </button>
        </header>
        <div className="aside-content">{children}</div>
      </aside>
    </div>
  );
}

const AsideContext = createContext<AsideContextValue | null>(null);

Aside.Provider = function AsideProvider({children}: {children: ReactNode}) {
  const [type, setType] = useState<AsideType>('closed');
  const [intent, setIntent] = useState<string | null>(null);

  return (
    <AsideContext.Provider
      value={{
        type,
        intent,
        open: (mode, nextIntent) => {
          setIntent(nextIntent ?? null);
          setType(mode);
        },
        close: () => {
          setIntent(null);
          setType('closed');
        },
        clearIntent: () => setIntent(null),
      }}
    >
      {children}
    </AsideContext.Provider>
  );
};

export function useAside() {
  const aside = useContext(AsideContext);
  if (!aside) {
    throw new Error('useAside must be used within an AsideProvider');
  }
  return aside;
}
