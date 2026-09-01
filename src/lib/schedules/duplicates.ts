import { normalizeName } from "@/lib/names";

/**
 * Names that look like they might be the same person.
 *
 * Spreadsheets produce near-duplicates — one sheet says "Dave", another
 * "Davey" — and once both exist their history is split in two. This offers a
 * hint so somebody can merge them; it never merges anything itself, because a
 * guess about who two names belong to is not a decision an app should make.
 *
 * Deliberately narrow: one name has to be the start of the other, with at
 * most a few characters between them. A looser rule (edit distance, say)
 * would pair "Dan" with "Dawn" and "Jon" with "Jan", and an admin who is
 * shown three wrong suggestions stops reading the fourth.
 *
 * Lifted out of the calendar app's people screen, where it lived inside the
 * component and so couldn't be tested.
 */
const MIN_PREFIX = 3;
const MAX_EXTRA = 3;

export function possibleDuplicates<T extends { displayName: string }>(
  people: readonly T[],
  limit = 5,
): Array<[T, T]> {
  const pairs: Array<[T, T]> = [];

  for (let i = 0; i < people.length; i += 1) {
    for (let j = i + 1; j < people.length; j += 1) {
      const a = normalizeName(people[i].displayName);
      const b = normalizeName(people[j].displayName);
      if (!a || !b) continue;

      const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
      if (shorter.length < MIN_PREFIX) continue;
      if (!longer.startsWith(shorter)) continue;
      if (longer.length - shorter.length > MAX_EXTRA) continue;

      pairs.push([people[i], people[j]]);
      if (pairs.length >= limit) return pairs;
    }
  }

  return pairs;
}
