/** Levenshtein edit distance between two strings (case-insensitive). */
export function levenshtein(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  if (s.length === 0) return t.length;
  if (t.length === 0) return s.length;

  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  const curr = new Array(t.length + 1).fill(0);

  for (let i = 1; i <= s.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr.slice();
  }
  return prev[t.length];
}

/**
 * Typo-tolerant similarity between `query` and the closest single word in
 * `text`, as a 0-1 score (1 = an exact word match). Checked word-by-word
 * rather than against the whole string so a short query like "chruch"
 * still matches inside a longer title like "Sunday Church Service".
 */
export function fuzzyMatchScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  let best = Infinity;
  for (const word of words) {
    best = Math.min(best, levenshtein(q, word));
  }
  return Math.max(0, 1 - best / q.length);
}
