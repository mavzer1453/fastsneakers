import {SHOP} from '~/data/shop';
import {useTranslate} from '~/lib/useTranslate';

/** Five tiles, keyed by name so the list needs no array indices. */
const STARS = ['s1', 's2', 's3', 's4', 's5'];

function StarTile() {
  return (
    <span className="review-badge-star">
      <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.4l6.5-.9z"
        />
      </svg>
    </span>
  );
}

/**
 * The rating strip: five filled tiles, then the score and the review count.
 *
 * Drawn rather than shipped as a PNG — it stays crisp on every screen, the
 * sentence goes through `t()` like the rest of the storefront, and the score
 * and count come from `SHOP.reviews`, so there is exactly one place to change
 * them.
 *
 * The sentence is split on its two tokens rather than assembled from
 * fragments, so a translator keeps control of word order — German and Turkish
 * both put the count first.
 *
 * Deliberately NOT wired to `AggregateRating` JSON-LD. Google only accepts
 * seller ratings gathered through a review system it can verify; self-declared
 * markup on a figure counted off Instagram is a manual-action risk, and the
 * visible badge carries the same trust weight without it.
 */
export function ReviewBadge({compact = false}: {compact?: boolean}) {
  const t = useTranslate();
  const {score, count} = SHOP.reviews;
  if (!SHOP.reviews.show) return null;

  // Languages put the score and the count in different orders (Turkish
  // leads with the count), so split on either placeholder, whichever comes
  // first, and bold each one where the sentence puts it.
  const parts = t('Rated {score}/5 stars based on {count} reviews').split(
    /(\{score\}\/5|\{count\})/,
  );

  return (
    <div className={`review-badge${compact ? ' is-compact' : ''}`}>
      <span className="review-badge-stars" aria-hidden="true">
        {STARS.map((id) => (
          <StarTile key={id} />
        ))}
      </span>
      <p className="review-badge-text">
        {parts.map((part, index) =>
          part === '{score}/5' ? (
            // eslint-disable-next-line react/no-array-index-key
            <strong key={index}>{score}/5</strong>
          ) : part === '{count}' ? (
            // eslint-disable-next-line react/no-array-index-key
            <strong key={index}>+{count}</strong>
          ) : (
            part
          ),
        )}
      </p>
    </div>
  );
}
