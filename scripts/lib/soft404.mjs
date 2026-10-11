/**
 * Copy that makes Google file a live, in-stock page under "Soft 404".
 *
 * A soft 404 is a 200 response whose CONTENT says the thing is gone. The
 * storefront's status codes were never the problem — missing products and
 * collections answer a hard 404 — the imported copy was: 8,394 products
 * opened with "... is exclusive and no longer available anywhere else".
 *
 * One list, shared by everything that needs to agree on it:
 *   - audit-soft404-copy.mjs   finds it in the live catalogue
 *   - publish-drafts.mjs       refuses to take a draft live while it has it
 *
 * Matched against plain text, case-insensitively. Deliberately not matching
 * a bare "exclusive" or scarcity marketing in general — only wording that
 * reads as the page's own subject being unavailable.
 */
export const SOFT_404_PHRASES = [
  // English
  /no longer available/i,
  /not available anymore/i,
  /currently unavailable/i,
  /\bout of stock\b/i,
  /\bsold out\b/i,
  /\bdiscontinued\b/i,
  /(page|product|item) (was |could )?not (be )?found/i,
  /does(n't| not) exist/i,
  // Dutch — the catalogue's original import language
  /nergens meer te krijgen/i,
  /niet meer (verkrijgbaar|beschikbaar|leverbaar)/i,
  /\buitverkocht\b/i,
  // The other storefront languages
  /nicht mehr (erhältlich|verfügbar|lieferbar)/i,
  /\bausverkauft\b/i,
  /n['’]est plus disponible|plus disponible nulle part/i,
  /\bépuisé\b/i,
  /non (è )?più disponibile/i,
  /\besaurito\b/i,
  /ya no está disponible/i,
  /\bagotado\b/i,
];

export const stripTags = (html) =>
  (html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The matched phrase with ~50 characters of context either side, or null. */
export function findSoft404Phrase(htmlOrText) {
  const text = stripTags(htmlOrText);
  for (const pattern of SOFT_404_PHRASES) {
    const match = pattern.exec(text);
    if (match) {
      const start = Math.max(0, match.index - 50);
      return text.slice(start, match.index + match[0].length + 50);
    }
  }
  return null;
}
