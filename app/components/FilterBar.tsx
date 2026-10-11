import {useEffect, useId, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {useNavigate, useSearchParams} from 'react-router';
import {
  COLOR_OPTIONS,
  brandLabel,
  buildBrandRows,
  getPriceBounds,
  getTagFacetValues,
  sortSizeValues,
  type FilterData,
} from '~/lib/filters';
import {SORT_OPTIONS} from '~/lib/sort';
import {useTranslate} from '~/lib/useTranslate';

/**
 * Zalando-style filter pills above the product grid. Each pill opens a panel
 * where choices are staged locally and only applied on Save, so shoppers can
 * tick several values without a page load per click.
 *
 * Multi-value groups (colour / brand / size) are OR-ed. The Storefront API
 * can only AND its filters, so the collection loader unions several queries
 * to make that work — see loadUnion() in the collection route.
 */
/** Product counts above this are not printed on the collection page. */
const MAX_SHOWN_COUNT = 600;

export function FilterBar({
  filterData,
  total,
  handle,
}: {
  filterData: FilterData[] | undefined | null;
  total: number | null;
  /** The collection's handle — on a brand's own page the Brand filter lists
   *  that brand's menu entries instead of every house. */
  handle?: string | null;
}) {
  const t = useTranslate();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const activeColors = params.getAll('color');
  const activeBrands = params.getAll('brand');
  const activeSizes = params.getAll('size');
  const activeSort = params.get('sort_by') ?? '';
  const priceMin = params.get('price_min') ?? '';
  const priceMax = params.get('price_max') ?? '';

  const bounds = getPriceBounds(filterData);
  const colorCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const {value, count} of getTagFacetValues(filterData, 'color')) {
      map[value] = count;
    }
    return map;
  }, [filterData]);
  const brandRows = useMemo(
    () =>
      buildBrandRows(
        {
          brand: getTagFacetValues(filterData, 'brand').sort(
            (a, b) => b.count - a.count,
          ),
          model: getTagFacetValues(filterData, 'model'),
          collab: getTagFacetValues(filterData, 'collab'),
          type: getTagFacetValues(filterData, 'type'),
        },
        handle,
      ),
    [filterData, handle],
  );
  const sizeValues = useMemo(
    () => sortSizeValues(getTagFacetValues(filterData, 'size')),
    [filterData],
  );

  useEffect(() => {
    if (!openPanel) return;
    function onPointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (barRef.current?.contains(event.target)) return;
      // The mobile sheet is portalled to <body>, so it sits outside barRef —
      // its own backdrop handles dismissal.
      if (
        event.target instanceof Element &&
        event.target.closest('.filter-sheet-root')
      ) {
        return;
      }
      setOpenPanel(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenPanel(null);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openPanel]);

  /** Replace one repeatable param with a whole list of values. */
  function applyList(key: string, values: string[]) {
    const next = new URLSearchParams(params);
    next.delete(key);
    for (const value of values) next.append(key, value);
    commit(next);
  }

  function applyScalars(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value == null || value === '') next.delete(key);
      else next.set(key, value);
    }
    commit(next);
  }

  function commit(next: URLSearchParams) {
    // Any filter change invalidates the current page/cursor.
    for (const key of ['cursor', 'direction', 'page']) next.delete(key);
    const query = next.toString();
    // Fire-and-forget: React Router owns the resulting navigation state.
    void navigate(query ? `?${query}` : '?', {preventScrollReset: true});
    setOpenPanel(null);
  }

  function clearAll() {
    const next = new URLSearchParams(params);
    for (const key of [
      'color',
      'brand',
      'size',
      'price_min',
      'price_max',
      'deals',
      'availability',
      'sort_by',
      'cursor',
      'direction',
      'page',
    ]) {
      next.delete(key);
    }
    commit(next);
  }

  const activeCount =
    activeColors.length +
    activeBrands.length +
    activeSizes.length +
    (priceMin || priceMax ? 1 : 0);

  const sortLabel = t(
    SORT_OPTIONS.find((option) => option.value === activeSort)?.label ??
      'Sort by',
  );

  const summary = (base: string, values: string[], render = (v: string) => v) =>
    values.length === 0
      ? base
      : values.length === 1
        ? render(values[0])
        : `${base} (${values.length})`;

  return (
    <div className="filter-bar" ref={barRef}>
      <div className="filter-pills">
        <FilterPill
          label={sortLabel}
          name="sort"
          isOpen={openPanel === 'sort'}
          isActive={Boolean(activeSort)}
          onToggle={setOpenPanel}
        >
          <ul className="filter-sort-list">
            {SORT_OPTIONS.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  className={
                    option.value === activeSort ? 'is-selected' : undefined
                  }
                  onClick={() =>
                    applyScalars({
                      sort_by: option.value === activeSort ? null : option.value,
                      // "Deals" is a discount filter under the hood.
                      deals: option.value === 'deals' ? '1' : null,
                    })
                  }
                >
                  <span>{t(option.label)}</span>
                  {option.value === activeSort ? <CheckIcon /> : null}
                </button>
              </li>
            ))}
          </ul>
        </FilterPill>

        {brandRows.length > 0 ? (
          <FilterPill
            label={summary(t('Brand'), activeBrands, brandLabel)}
            name="brand"
            isOpen={openPanel === 'brand'}
            isActive={activeBrands.length > 0}
            onToggle={setOpenPanel}
          >
            <MultiPanel
              searchable
              searchPlaceholder={t('Search brand')}
              options={brandRows.map((row) => ({
                value: row.values.join(','),
                values: row.values,
                label: row.label,
                count: row.count,
                emphasis: row.isFamilyParent,
                keywords: row.keywords,
              }))}
              selected={activeBrands}
              onSave={(values) => applyList('brand', values)}
            />
          </FilterPill>
        ) : null}

        {sizeValues.length > 0 ? (
          <FilterPill
            label={summary(t('Size'), activeSizes)}
            name="size"
            isOpen={openPanel === 'size'}
            isActive={activeSizes.length > 0}
            onToggle={setOpenPanel}
          >
            <MultiPanel
              options={sizeValues.map((entry) => ({
                value: entry.value,
                label: entry.value,
                count: entry.count,
              }))}
              selected={activeSizes}
              onSave={(values) => applyList('size', values)}
            />
          </FilterPill>
        ) : null}

        <FilterPill
          label={summary(
            t('Colour'),
            activeColors,
            (slug) =>
              COLOR_OPTIONS.find((option) => option.slug === slug)?.label ??
              slug,
          )}
          name="color"
          isOpen={openPanel === 'color'}
          isActive={activeColors.length > 0}
          onToggle={setOpenPanel}
        >
          <MultiPanel
            options={COLOR_OPTIONS.map((option) => ({
              value: option.slug,
              label: option.label,
              count: colorCounts[option.slug] ?? 0,
              swatch: option.swatch,
            }))}
            selected={activeColors}
            onSave={(values) => applyList('color', values)}
          />
        </FilterPill>

        <FilterPill
          label={
            priceMin || priceMax
              ? `€${priceMin || bounds?.min || 0} – €${priceMax || bounds?.max || ''}`
              : t('Price')
          }
          name="price"
          isOpen={openPanel === 'price'}
          isActive={Boolean(priceMin || priceMax)}
          onToggle={setOpenPanel}
        >
          <PricePanel
            min={priceMin}
            max={priceMax}
            bounds={bounds}
            onApply={applyScalars}
          />
        </FilterPill>

      </div>

      {/* Clear all sits on its own line above the count, not as the last pill:
          the pill row scrolls sideways on phones, so a shopper with filters
          on could not see the way out without scrolling to the end of it. */}
      {activeCount > 0 ? (
        <div className="filter-bar-actions">
          <button type="button" className="filter-clear-all" onClick={clearAll}>
            {t('Clear filters ({count})').replace(
              '{count}',
              String(activeCount),
            )}
          </button>
        </div>
      ) : null}

      {/* Owner request: past 600 the figure is left off — "2124 products"
          tells a shopper nothing they can act on, a small filtered count does. */}
      {total != null && total <= MAX_SHOWN_COUNT ? (
        <span className="filter-bar-count">
          {t('{count} products').replace('{count}', String(total))}
        </span>
      ) : null}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="filter-check">
      <path
        d="m5 12.5 4.5 4.5L19 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Tracks the narrow breakpoint so panels can become sheets on phones. */
function useIsNarrow() {
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 48em)');
    const sync = () => setIsNarrow(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return isNarrow;
}

function FilterPill({
  label,
  name,
  isOpen,
  isActive,
  onToggle,
  children,
}: {
  label: string;
  name: string;
  isOpen: boolean;
  isActive: boolean;
  onToggle: (panel: string | null) => void;
  children: React.ReactNode;
}) {
  const t = useTranslate();
  const panelId = useId();
  const isNarrow = useIsNarrow();

  // On phones the pill row scrolls sideways, and anything positioned inside
  // that scroller is at the mercy of its clipping and stacking context. Lift
  // the sheet out to <body> so it can't be hidden by an ancestor.
  const sheet =
    isOpen && isNarrow && typeof document !== 'undefined'
      ? createPortal(
          <div className="filter-sheet-root" role="presentation">
            <button
              type="button"
              className="filter-sheet-backdrop reset"
              aria-label={t('Close filters')}
              onClick={() => onToggle(null)}
            />
            <div
              className="filter-panel is-sheet"
              id={panelId}
              role="dialog"
              aria-modal="true"
              aria-label={label}
            >
              <div className="filter-sheet-head">
                <span>{label}</span>
                <button
                  type="button"
                  className="filter-sheet-close reset"
                  aria-label={t('Close')}
                  onClick={() => onToggle(null)}
                >
                  &times;
                </button>
              </div>
              {children}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="filter-pill-wrap">
      <button
        type="button"
        className={`filter-pill${isActive ? ' is-active' : ''}${
          isOpen ? ' is-open' : ''
        }`}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => onToggle(isOpen ? null : name)}
      >
        {label}
        <svg viewBox="0 0 24 24" aria-hidden="true" className="filter-caret">
          <path
            d="m6 9 6 6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {isOpen && !isNarrow ? (
        <div className="filter-panel" id={panelId}>
          {children}
        </div>
      ) : null}
      {sheet}
    </div>
  );
}

interface MultiOption {
  value: string;
  label: string;
  count: number;
  swatch?: string;
  /** Slugs the row toggles; defaults to [value]. Family rows carry several. */
  values?: string[];
  /** Renders the row as a group heading (e.g. "Nike (all)"). */
  emphasis?: boolean;
  /** Extra text the search box matches — the house a silhouette belongs to. */
  keywords?: string;
}

/**
 * Checklist panel with staged selection: ticking rows only updates local
 * state, and Save writes the whole set to the URL in one navigation.
 */
function MultiPanel({
  options,
  selected,
  onSave,
  searchable = false,
  searchPlaceholder,
}: {
  options: MultiOption[];
  selected: string[];
  onSave: (values: string[]) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
}) {
  const t = useTranslate();
  const [staged, setStaged] = useState<string[]>(selected);
  const [term, setTerm] = useState('');

  // Re-sync when the shopper reopens the panel after applying elsewhere.
  useEffect(() => setStaged(selected), [selected.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = term.trim()
    ? options.filter((option) =>
        `${option.label} ${option.keywords ?? ''}`
          .toLowerCase()
          .includes(term.trim().toLowerCase()),
      )
    : options;

  /** A row may stand for several slugs (a brand family) — toggle them all. */
  const toggle = (option: MultiOption) => {
    const slugs = option.values ?? [option.value];
    setStaged((current) => {
      const allOn = slugs.every((slug) => current.includes(slug));
      return allOn
        ? current.filter((entry) => !slugs.includes(entry))
        : [...current, ...slugs.filter((slug) => !current.includes(slug))];
    });
  };

  return (
    <>
      {searchable ? (
        <div className="filter-search">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle
              cx="11"
              cy="11"
              r="7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="m20 20-3-3"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <input
            type="search"
            value={term}
            placeholder={searchPlaceholder ?? t('Search')}
            aria-label={searchPlaceholder ?? t('Search')}
            onChange={(event) => setTerm(event.currentTarget.value)}
          />
        </div>
      ) : null}

      <ul className="filter-option-list">
        {visible.map((option) => {
          const slugs = option.values ?? [option.value];
          const isOn = slugs.every((slug) => staged.includes(slug));
          const disabled = option.count === 0 && !isOn;
          return (
            <li key={option.value}>
              <button
                type="button"
                className={`${isOn ? 'is-selected' : ''}${
                  option.emphasis ? ' is-family' : ''
                }`.trim()}
                aria-pressed={isOn}
                disabled={disabled}
                onClick={() => toggle(option)}
              >
                {option.swatch ? (
                  <span
                    className={`filter-swatch${
                      option.swatch === 'multi' ? ' is-multi' : ''
                    }`}
                    style={
                      option.swatch === 'multi'
                        ? undefined
                        : {background: option.swatch}
                    }
                    aria-hidden="true"
                  />
                ) : null}
                <span className="filter-option-name">{option.label}</span>
                <span className="filter-option-count">{option.count}</span>
                {isOn ? <CheckIcon /> : null}
              </button>
            </li>
          );
        })}
        {visible.length === 0 ? (
          <li className="filter-option-empty">{t('No matches')}</li>
        ) : null}
      </ul>

      <div className="filter-panel-actions">
        <button
          type="button"
          className="filter-panel-clear"
          disabled={staged.length === 0}
          onClick={() => {
            setStaged([]);
            onSave([]);
          }}
        >
          {t('Clear filters')}
        </button>
        <button
          type="button"
          className="filter-panel-save"
          onClick={() => onSave(staged)}
        >
          {t('Save')}
        </button>
      </div>
    </>
  );
}

function PricePanel({
  min,
  max,
  bounds,
  onApply,
}: {
  min: string;
  max: string;
  bounds: {min: number; max: number} | null;
  onApply: (changes: Record<string, string | null>) => void;
}) {
  const t = useTranslate();
  const [from, setFrom] = useState(min);
  const [to, setTo] = useState(max);
  const fromId = useId();
  const toId = useId();

  return (
    <>
      <div className="filter-price-row">
        <div className="filter-price-field">
          <label htmlFor={fromId}>{t('Price from')}</label>
          <div className="filter-price-input">
            <span aria-hidden="true">€</span>
            <input
              id={fromId}
              type="number"
              inputMode="numeric"
              min={0}
              placeholder={String(bounds?.min ?? 0)}
              value={from}
              onChange={(event) => setFrom(event.currentTarget.value)}
            />
          </div>
        </div>
        <span className="filter-price-dash" aria-hidden="true">
          —
        </span>
        <div className="filter-price-field">
          <label htmlFor={toId}>{t('Price to')}</label>
          <div className="filter-price-input">
            <span aria-hidden="true">€</span>
            <input
              id={toId}
              type="number"
              inputMode="numeric"
              min={0}
              placeholder={String(bounds?.max ?? '')}
              value={to}
              onChange={(event) => setTo(event.currentTarget.value)}
            />
          </div>
        </div>
      </div>

      <div className="filter-price-quick">
        {[50, 100, 150].map((amount) => (
          <button
            key={amount}
            type="button"
            onClick={() => onApply({price_min: null, price_max: String(amount)})}
          >
            {t('Under €{amount}').replace('{amount}', String(amount))}
          </button>
        ))}
      </div>

      <div className="filter-panel-actions">
        <button
          type="button"
          className="filter-panel-clear"
          disabled={!from && !to}
          onClick={() => {
            setFrom('');
            setTo('');
            onApply({price_min: null, price_max: null});
          }}
        >
          {t('Clear filters')}
        </button>
        <button
          type="button"
          className="filter-panel-save"
          onClick={() =>
            onApply({price_min: from || null, price_max: to || null})
          }
        >
          {t('Save')}
        </button>
      </div>
    </>
  );
}
