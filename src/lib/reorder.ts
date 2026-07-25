/** Moves the item at `fromIndex` to `toIndex`, shifting the items between them. */
export function reorderArray<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const clamped = Math.max(0, Math.min(toIndex, items.length - 1));
  if (fromIndex === clamped) return items;
  const result = [...items];
  const [moved] = result.splice(fromIndex, 1);
  result.splice(clamped, 0, moved);
  return result;
}
