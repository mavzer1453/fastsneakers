import {useLocation, useNavigate, useSearchParams} from 'react-router';
import {SORT_OPTIONS} from '~/lib/sort';

// 96 was dropped: with per-card variant data for quick add, a 96-product
// page made low-end phones churn. 48 keeps browsing fast.
const SHOW_OPTIONS = [24, 48];

/**
 * Page-size dropdown ("Show 24") — same URL-driven pattern as SortSelect.
 */
export function ShowSelect() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const current = searchParams.get('show') ?? '24';

  return (
    <form method="get" className="collection-sort">
      <label htmlFor="show">Show</label>
      <select
        id="show"
        name="show"
        defaultValue={current}
        onChange={(event) => {
          const params = new URLSearchParams(location.search);
          params.set('show', event.target.value);
          params.delete('cursor');
          params.delete('direction');
          void navigate(`${location.pathname}?${params.toString()}`);
        }}
      >
        {SHOW_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="btn btn-ghost">
          Apply
        </button>
      </noscript>
    </form>
  );
}

/**
 * Sort dropdown for product listings. Progressive enhancement: a plain GET
 * form without JS, instant navigation with it. Changing the sort resets
 * pagination cursors.
 */
export function SortSelect() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const current = searchParams.get('sort_by') ?? 'featured';

  return (
    <form method="get" className="collection-sort">
      <label htmlFor="sort_by">Sort by</label>
      <select
        id="sort_by"
        name="sort_by"
        defaultValue={current}
        onChange={(event) => {
          const params = new URLSearchParams(location.search);
          params.set('sort_by', event.target.value);
          params.delete('cursor');
          params.delete('direction');
          void navigate(`${location.pathname}?${params.toString()}`);
        }}
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="btn btn-ghost">
          Apply
        </button>
      </noscript>
    </form>
  );
}
