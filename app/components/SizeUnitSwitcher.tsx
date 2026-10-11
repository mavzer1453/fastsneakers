import {useEffect, useSyncExternalStore} from 'react';
import type {SizeUnit} from '~/lib/sizes';
import {useTranslate} from '~/lib/useTranslate';

/**
 * Which scale sizes are read out in, remembered for the visit.
 *
 * We can't know whether a shopper is buying men's or women's — the same
 * physical shoe is EU 40 either way, and only the US number moves. So the
 * shopper picks their own scale and we remember it, rather than guessing from
 * the product and getting it wrong a size and a half at a time.
 *
 * sessionStorage, not localStorage, is the whole point of "until they close
 * the site": the choice survives every page of the visit and is gone on the
 * next one, so nobody comes back months later to a storefront silently
 * speaking a scale they picked once.
 *
 * A module-level store rather than context: the size picker exists in two
 * unrelated trees (the quick-add modal and the product page), and threading a
 * provider through both to share one string is more moving parts than the
 * feature is worth.
 */
const STORAGE_KEY = 'fastsneakers:size-unit';

/** Every stored scale. The switcher shows them as EU | US | UK + Men | Women. */
export const SIZE_UNITS: SizeUnit[] = ['EU', 'US_M', 'US_W', 'UK_M', 'UK_W'];

/** EU / US / UK, ignoring men's vs women's — what a kids button stands for. */
function region(unit: SizeUnit): string {
  return unit.slice(0, 2);
}

function isSizeUnit(value: string): value is SizeUnit {
  return (SIZE_UNITS as string[]).includes(value);
}

let currentUnit: SizeUnit = 'EU';
let restored = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): SizeUnit {
  return currentUnit;
}

// The server has no session, so it always renders EU. Reading the stored
// choice happens after hydration (below), which keeps the first client render
// identical to the server's.
function getServerSnapshot(): SizeUnit {
  return 'EU';
}

export function setSizeUnit(unit: SizeUnit) {
  if (unit === currentUnit) return;
  currentUnit = unit;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, unit);
  } catch {
    // Private windows and blocked storage: the choice still applies for this
    // page, it just won't survive the next navigation. Not worth failing over.
  }
  emit();
}

export function useSizeUnit(): SizeUnit {
  const unit = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (restored) return;
    restored = true;
    try {
      const stored = window.sessionStorage.getItem(STORAGE_KEY);
      if (stored && stored !== currentUnit && isSizeUnit(stored)) {
        currentUnit = stored;
        emit();
      }
    } catch {
      // No stored preference to restore; EU stands.
    }
  }, []);

  return unit;
}

type Region = 'EU' | 'US' | 'UK';

const REGIONS: {code: Region; title: string}[] = [
  {code: 'EU', title: 'European sizing — how we stock and ship'},
  {code: 'US', title: 'US sizing'},
  {code: 'UK', title: 'UK sizing'},
];

function unitFor(regionCode: Region, women: boolean): SizeUnit {
  if (regionCode === 'EU') return 'EU';
  return `${regionCode}_${women ? 'W' : 'M'}` as SizeUnit;
}

/**
 * Two small segmented controls instead of one long one (24 Sep 2026): the
 * scale — EU | US | UK — and, once US or UK is picked, Men | Women. Five
 * buttons in a row (EU, US Men, US Women, UK Men, UK Women) did not fit a
 * phone in any language. Still one stored SizeUnit underneath, so the
 * conversion code and the saved preference are unchanged.
 *
 * Kids products get the scale control only: a children's size is one number
 * for everyone, so a men/women choice would change nothing.
 */
export function SizeUnitSwitcher({kids = false}: {kids?: boolean}) {
  const t = useTranslate();
  const unit = useSizeUnit();
  const activeRegion = region(unit) as Region;
  const women = unit.endsWith('_W');

  return (
    <div className="size-unit-row">
      <div className="size-unit-switch" role="group" aria-label={t('Size scale')}>
        {REGIONS.map((option) => {
          const active = option.code === activeRegion;
          return (
            <button
              key={option.code}
              type="button"
              // Deliberately not `button.reset`: that helper pins childless
              // buttons to a 1.5rem height and underlines them on hover,
              // which burst this pill out of its track.
              className={`size-unit-option${active ? ' is-active' : ''}`}
              aria-pressed={active}
              title={t(option.title)}
              onClick={() => setSizeUnit(unitFor(option.code, women))}
            >
              {option.code}
            </button>
          );
        })}
      </div>
      {!kids && activeRegion !== 'EU' ? (
        <div className="size-unit-switch" role="group" aria-label={t('Sizing for')}>
          {[false, true].map((isWomen) => (
            <button
              key={String(isWomen)}
              type="button"
              className={`size-unit-option${
                women === isWomen ? ' is-active' : ''
              }`}
              aria-pressed={women === isWomen}
              onClick={() => setSizeUnit(unitFor(activeRegion, isWomen))}
            >
              {t(isWomen ? 'Women' : 'Men')}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
