import {useEffect, useMemo, useState} from 'react';
import {Form, Link, useLocation, useSearchParams} from 'react-router';
import {
  displayTypeLabel,
  getAvailabilityCounts,
  getPriceBounds,
  groupTypeValues,
  getVendorValues,
  type FilterData,
  type TypeGroup,
} from '~/lib/filters';
import {getCurrency} from '~/lib/i18n';
import {useLocalizedHref, useSelectedLocale} from '~/lib/localizedLink';
import {displayVendor, BRAND_LINKS, scopedLinksFor} from '~/lib/brand';

/**
 * Collection filters, Zalando-style:
 * - Desktop: always-open sidebar on the left (price slider, brand pills,
 *   availability).
 * - Mobile: a compact "Filters" bar on top of the grid that expands in
 *   place, with an active-filter count badge.
 * - Applied filters render as removable chips with a "Clear all" action.
 * Everything is URL-driven (GET), so filters work without JS and are
 * shareable/back-button friendly.
 */
export function CollectionFilters({
  filterData,
  total,
}: {
  filterData: FilterData[] | undefined | null;
  total: number | null;
}) {
  const bounds = getPriceBounds(filterData);
  const vendors = getVendorValues(filterData).map((vendor) => ({
    ...vendor,
    label: displayVendor(vendor.label) ?? vendor.label,
  }));
  const types = groupTypeValues(filterData);
  const availabilityCounts = getAvailabilityCounts(filterData);
  const [searchParams] = useSearchParams();

  const activeCount =
    (searchParams.get('price_min') || searchParams.get('price_max') ? 1 : 0) +
    searchParams.getAll('vendor').length +
    searchParams.getAll('type').length +
    (searchParams.get('availability') ? 1 : 0);

  // Desktop: open. Mobile: collapsed until tapped. Decided on the client so
  // SSR stays deterministic; the flash is invisible because the panel only
  // collapses on small screens.
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => {
    setOpen(window.matchMedia('(min-width: 60em)').matches);
  }, []);

  return (
    <aside className="collection-filters">
      <details
        className="filters-panel"
        open={open ?? true}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary className="filters-title">
          <span className="filters-title-label">
            <FilterIcon />
            Filters
            {activeCount > 0 ? (
              <span className="filters-count-badge">{activeCount}</span>
            ) : null}
          </span>
          <span className="filters-title-caret" aria-hidden="true">
            ▾
          </span>
        </summary>
        <div className="filters-body">
          {activeCount > 0 ? <AppliedFilterChips vendors={vendors} /> : null}
          {types.length > 1 ? <CategoryFilter types={types} /> : null}
          {bounds && bounds.max > bounds.min ? (
            <PriceFilter bounds={bounds} total={total} />
          ) : null}
          {vendors.length > 1 ? (
            <BrandFilter vendors={vendors} />
          ) : (
            <BrandLinksFilter />
          )}
          <AvailabilityFilter counts={availabilityCounts} />
        </div>
      </details>
    </aside>
  );
}

function FilterIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 6h16M7 12h10M10 18h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Removable chips for every applied filter + "Clear all". */
function AppliedFilterChips({
  vendors,
}: {
  vendors: Array<{label: string}>;
}) {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const currencySymbol = getCurrency(useSelectedLocale().currency).symbol;

  const stripPagination = (params: URLSearchParams) => {
    params.delete('cursor');
    params.delete('direction');
    return params;
  };

  const chips: Array<{key: string; label: string; href: string}> = [];

  const priceMin = searchParams.get('price_min');
  const priceMax = searchParams.get('price_max');
  if (priceMin || priceMax) {
    const params = stripPagination(new URLSearchParams(searchParams));
    params.delete('price_min');
    params.delete('price_max');
    chips.push({
      key: 'price',
      label: `${currencySymbol}${priceMin || '0'} – ${currencySymbol}${
        priceMax || '∞'
      }`,
      href: `${location.pathname}?${params.toString()}`,
    });
  }

  for (const vendor of searchParams.getAll('vendor')) {
    const params = stripPagination(new URLSearchParams(searchParams));
    const remaining = params.getAll('vendor').filter((v) => v !== vendor);
    params.delete('vendor');
    for (const v of remaining) params.append('vendor', v);
    chips.push({
      key: `vendor-${vendor}`,
      label: displayVendor(vendor) ?? vendor,
      href: `${location.pathname}?${params.toString()}`,
    });
  }

  for (const type of searchParams.getAll('type')) {
    const params = stripPagination(new URLSearchParams(searchParams));
    const remaining = params.getAll('type').filter((t) => t !== type);
    params.delete('type');
    for (const t of remaining) params.append('type', t);
    chips.push({
      key: `type-${type}`,
      label: displayTypeLabel(type),
      href: `${location.pathname}?${params.toString()}`,
    });
  }

  const availability = searchParams.get('availability');
  if (availability === 'in' || availability === 'out') {
    const params = stripPagination(new URLSearchParams(searchParams));
    params.delete('availability');
    chips.push({
      key: 'availability',
      label: availability === 'in' ? 'In stock' : 'Out of stock',
      href: `${location.pathname}?${params.toString()}`,
    });
  }

  if (chips.length === 0) return null;

  const clearParams = stripPagination(new URLSearchParams(searchParams));
  clearParams.delete('price_min');
  clearParams.delete('price_max');
  clearParams.delete('vendor');
  clearParams.delete('type');
  clearParams.delete('availability');
  const clearSearch = clearParams.toString();

  return (
    <div className="filter-chips" role="group" aria-label="Active filters">
      {chips.map((chip) => (
        <Link
          key={chip.key}
          className="filter-chip"
          to={chip.href}
          preventScrollReset
          aria-label={`Remove filter ${chip.label}`}
        >
          {chip.label}
          <span aria-hidden="true">×</span>
        </Link>
      ))}
      <Link
        className="filter-chips-clear"
        to={`${location.pathname}${clearSearch ? `?${clearSearch}` : ''}`}
        preventScrollReset
      >
        Clear all
      </Link>
    </div>
  );
}

/** Hidden inputs that keep the other params when the price form submits. */
function PreservedParams({omit}: {omit: string[]}) {
  const [searchParams] = useSearchParams();
  const entries = [...searchParams.entries()].filter(
    ([key]) => !omit.includes(key) && key !== 'cursor' && key !== 'direction',
  );
  // The same key can repeat (e.g. vendor=A&vendor=B) — disambiguate with an
  // occurrence counter so React keys stay stable and unique.
  const seen = new Map<string, number>();
  return (
    <>
      {entries.map(([key, value]) => {
        const composite = `${key}=${value}`;
        const occurrence = (seen.get(composite) ?? 0) + 1;
        seen.set(composite, occurrence);
        return (
          <input
            key={`${composite}#${occurrence}`}
            type="hidden"
            name={key}
            value={value}
          />
        );
      })}
    </>
  );
}

function PriceFilter({
  bounds,
  total,
}: {
  bounds: {min: number; max: number};
  total: number | null;
}) {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  // Prices filter in the shopper's active currency — show its symbol.
  const currencySymbol = getCurrency(useSelectedLocale().currency).symbol;

  const appliedMin = Number(searchParams.get('price_min'));
  const appliedMax = Number(searchParams.get('price_max'));
  const [min, setMin] = useState(
    Number.isFinite(appliedMin) && appliedMin > 0 ? appliedMin : bounds.min,
  );
  const [max, setMax] = useState(
    Number.isFinite(appliedMax) && appliedMax > 0 ? appliedMax : bounds.max,
  );

  const clampedMin = Math.min(min, max);
  const clampedMax = Math.max(min, max);
  const span = bounds.max - bounds.min || 1;
  const leftPct = ((clampedMin - bounds.min) / span) * 100;
  const rightPct = 100 - ((clampedMax - bounds.min) / span) * 100;

  return (
    <Form
      method="get"
      action={location.pathname}
      className="filter-block"
      preventScrollReset
    >
      <PreservedParams omit={['price_min', 'price_max']} />
      <h4>Price</h4>
      <div className="filter-price-inputs">
        <label>
          <span aria-hidden="true">{currencySymbol}</span>
          <input
            type="number"
            name="price_min"
            aria-label="Minimum price"
            min={bounds.min}
            max={bounds.max}
            value={clampedMin}
            onChange={(event) => setMin(Number(event.target.value) || 0)}
          />
        </label>
        <span className="filter-price-dash" aria-hidden="true">
          –
        </span>
        <label>
          <span aria-hidden="true">{currencySymbol}</span>
          <input
            type="number"
            name="price_max"
            aria-label="Maximum price"
            min={bounds.min}
            max={bounds.max}
            value={clampedMax}
            onChange={(event) =>
              setMax(Number(event.target.value) || bounds.max)
            }
          />
        </label>
      </div>
      <div className="dual-range">
        <div className="dual-range-track">
          <span style={{left: `${leftPct}%`, right: `${rightPct}%`}} />
        </div>
        <input
          type="range"
          min={bounds.min}
          max={bounds.max}
          value={clampedMin}
          aria-label="Minimum price slider"
          onChange={(event) =>
            setMin(Math.min(Number(event.target.value), clampedMax))
          }
        />
        <input
          type="range"
          min={bounds.min}
          max={bounds.max}
          value={clampedMax}
          aria-label="Maximum price slider"
          onChange={(event) =>
            setMax(Math.max(Number(event.target.value), clampedMin))
          }
        />
      </div>
      <div className="filter-apply-row">
        <span className="filter-items-count">
          {total != null ? `${total} items` : ''}
        </span>
        <button type="submit" className="btn btn-dark btn-sm">
          Apply
        </button>
      </div>
    </Form>
  );
}

function BrandFilter({
  vendors,
}: {
  vendors: Array<{id: string; label: string; count: number}>;
}) {
  const [query, setQuery] = useState('');
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const active = new Set(searchParams.getAll('vendor'));

  const visible = useMemo(() => {
    const lower = query.trim().toLowerCase();
    if (!lower) return vendors;
    return vendors.filter((vendor) =>
      vendor.label.toLowerCase().includes(lower),
    );
  }, [vendors, query]);

  const toggleHref = (label: string) => {
    const params = new URLSearchParams(searchParams);
    const current = params.getAll('vendor');
    params.delete('vendor');
    params.delete('cursor');
    params.delete('direction');
    const next = current.includes(label)
      ? current.filter((existing) => existing !== label)
      : [...current, label];
    for (const vendor of next) params.append('vendor', vendor);
    const search = params.toString();
    return `${location.pathname}${search ? `?${search}` : ''}`;
  };

  return (
    <div className="filter-block">
      <h4>Brand</h4>
      {vendors.length > 8 ? (
        <input
          type="search"
          className="brand-search"
          placeholder="Search brands…"
          aria-label="Search brands"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      ) : null}
      <div className="brand-pills">
        {visible.map((vendor) => (
          <Link
            key={vendor.id}
            to={toggleHref(vendor.label)}
            preventScrollReset
            prefetch="intent"
            className={`brand-pill${
              active.has(vendor.label) ? ' is-active' : ''
            }`}
          >
            {vendor.label}
            {vendor.count > 0 ? (
              <span className="brand-pill-count">{vendor.count}</span>
            ) : null}
          </Link>
        ))}
        {visible.length === 0 ? (
          <span className="brand-pills-empty">No brands match</span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * MERA-style category checkboxes with product counts (productType facet).
 * Rows are grouped by display label — one row can cover several raw
 * productType values (case variants), and toggling it toggles all of them.
 */
function CategoryFilter({types}: {types: TypeGroup[]}) {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const active = new Set(searchParams.getAll('type'));

  const toggleHref = (group: TypeGroup) => {
    const params = new URLSearchParams(searchParams);
    const current = params.getAll('type');
    params.delete('type');
    params.delete('cursor');
    params.delete('direction');
    const isActive = group.raws.some((raw) => active.has(raw));
    const next = isActive
      ? current.filter((existing) => !group.raws.includes(existing))
      : [...current, ...group.raws];
    for (const type of next) params.append('type', type);
    const search = params.toString();
    return `${location.pathname}${search ? `?${search}` : ''}`;
  };

  return (
    <div className="filter-block">
      <h4>Category</h4>
      <div className="filter-checks">
        {types.map((group) => {
          const checked = group.raws.some((raw) => active.has(raw));
          return (
            <Link
              key={group.display}
              to={toggleHref(group)}
              preventScrollReset
              className="filter-checkbox"
              role="checkbox"
              aria-checked={checked}
            >
              <span
                className={`filter-checkbox-box${checked ? ' is-checked' : ''}`}
                aria-hidden="true"
              >
                {checked ? '✓' : ''}
              </span>
              <span className="filter-checkbox-label">{group.display}</span>
              <span className="filter-checkbox-count">{group.count}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Context-aware navigation links in the sidebar. On Sale it lists the
 * brand-on-sale collections (so "Nike" keeps you inside the sale), on a
 * brand page it lists that brand's models, on Men it lists the men's
 * subcategory collections — and elsewhere it falls back to the full brand
 * list. Until every product carries a real `vendor`, this replaces the
 * native brand facet.
 */
function BrandLinksFilter() {
  const localize = useLocalizedHref();
  const location = useLocation();
  const handle =
    location.pathname.match(/\/collections\/([^/]+)/)?.[1] ?? '';
  const scoped = scopedLinksFor(handle);
  const heading = scoped?.heading ?? 'Brand';
  const links = scoped?.links ?? BRAND_LINKS;
  const active = handle;

  return (
    <div className="filter-block">
      <h4>{heading}</h4>
      <div className="brand-pills">
        {links.map((brand) => (
          <Link
            key={brand.handle}
            to={localize(`/collections/${brand.handle}`)}
            prefetch="intent"
            className={`brand-pill${
              brand.handle === active ? ' is-active' : ''
            }`}
          >
            {brand.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** In stock / out of stock rows with counts, MERA-style. */
function AvailabilityFilter({
  counts,
}: {
  counts: {inStock: number; outOfStock: number} | null;
}) {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const current = searchParams.get('availability');

  const toggleHref = (mode: 'in' | 'out') => {
    const params = new URLSearchParams(searchParams);
    params.delete('cursor');
    params.delete('direction');
    if (current === mode) {
      params.delete('availability');
    } else {
      params.set('availability', mode);
    }
    const search = params.toString();
    return `${location.pathname}${search ? `?${search}` : ''}`;
  };

  return (
    <div className="filter-block">
      <h4>Availability</h4>
      <div className="filter-availability">
        <Link
          to={toggleHref('in')}
          preventScrollReset
          className={`filter-availability-row${
            current === 'in' ? ' is-active' : ''
          }`}
        >
          <span>In stock</span>
          {counts ? <span>{counts.inStock}</span> : null}
        </Link>
        <Link
          to={toggleHref('out')}
          preventScrollReset
          className={`filter-availability-row${
            current === 'out' ? ' is-active' : ''
          }`}
        >
          <span>Out of stock</span>
          {counts ? <span>{counts.outOfStock}</span> : null}
        </Link>
      </div>
    </div>
  );
}
