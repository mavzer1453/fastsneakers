import {Link} from 'react-router';

/**
 * Zalando-style pager: ‹ Page X of Y ›. Plain navigation links (no scroll
 * preservation) so every page change starts at the top of the page.
 */
export function Pager({
  page,
  pageCount,
  prevTo,
  nextTo,
}: {
  page: number;
  pageCount: number | null;
  prevTo: string | null;
  nextTo: string | null;
}) {
  if (!prevTo && !nextTo) return null;

  const chevron = (direction: 'left' | 'right') => (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M14.5 5.5 8 12l6.5 6.5' : 'M9.5 5.5 16 12l-6.5 6.5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  return (
    <nav className="pager" aria-label="Pagination">
      {prevTo ? (
        <Link className="pager-arrow" to={prevTo} aria-label="Previous page">
          {chevron('left')}
        </Link>
      ) : (
        <span className="pager-arrow is-disabled" aria-hidden="true">
          {chevron('left')}
        </span>
      )}
      <span className="pager-status">
        Page {page}
        {pageCount != null ? ` of ${pageCount}` : ''}
      </span>
      {nextTo ? (
        <Link className="pager-arrow" to={nextTo} aria-label="Next page">
          {chevron('right')}
        </Link>
      ) : (
        <span className="pager-arrow is-disabled" aria-hidden="true">
          {chevron('right')}
        </span>
      )}
    </nav>
  );
}
