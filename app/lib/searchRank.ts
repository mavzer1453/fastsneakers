/**
 * Re-ranks Shopify search results so the product a shopper NAMED comes first.
 *
 * Shopify's relevance counts matching words. Typing "Gel-Kayano 20 White Pure
 * Silver" therefore ranked a dozen "… Pure Silver" Kayano 14s and a Gel-1130
 * above "ASICS Gel-Kayano 20 White": they matched more words, and the model
 * number "20" counted no more than "Silver". Here:
 *   - a number in the query (model: 20, 14, 1130, 9060…) must appear in the
 *     title, or the product drops well down;
 *   - titles containing every query word, or the query as a phrase, win;
 *   - otherwise more matched words win; ties keep Shopify's own order.
 */

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

export function searchScore(title: string, term: string): number {
  const q = words(term);
  if (!q.length) return 0;
  const t = words(title);
  const tset = new Set(t);
  const matched = q.filter((w) => tset.has(w));
  const numbers = q.filter((w) => /\d/.test(w));

  let score = matched.length * 10;
  score -= numbers.filter((n) => !tset.has(n)).length * 100;
  if (matched.length === q.length) score += 40;
  const flatTitle = ` ${t.join(' ')} `;
  if (flatTitle.includes(` ${q.join(' ')} `)) score += 60;
  // Title fully covered by the query (e.g. "Gel-Kayano 20 White" for
  // "Gel-Kayano 20 White Pure Silver"): the shopper typed a longer name.
  const tCore = t.filter((w) => w !== 'asics' && w !== 'nike' && w !== 'adidas');
  if (tCore.length && tCore.every((w) => q.includes(w))) score += 30;
  return score;
}

/** Stable sort by score, highest first; equal scores keep the input order. */
export function rankByTerm<T>(items: T[], term: string, titleOf: (item: T) => string): T[] {
  return items
    .map((item, index) => ({item, index, score: searchScore(titleOf(item) ?? '', term)}))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((x) => x.item);
}
