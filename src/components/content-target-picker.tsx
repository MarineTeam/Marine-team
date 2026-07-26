"use client";

export type SeriesOption = { id: string; title: string };
export type CategoryOption = { id: string; name: string };

/** Encodes a series-or-category pick as a single string for a <select>, e.g. "s:abc" or "c:xyz". */
export function formatTarget(seriesId?: string | null, categoryId?: string | null): string {
  if (seriesId) return `s:${seriesId}`;
  if (categoryId) return `c:${categoryId}`;
  return "";
}

export function parseTarget(target: string): { seriesId: string | null; categoryId: string | null } {
  if (target.startsWith("s:")) return { seriesId: target.slice(2), categoryId: null };
  if (target.startsWith("c:")) return { seriesId: null, categoryId: target.slice(2) };
  return { seriesId: null, categoryId: null };
}

/**
 * A video/file can be attached to a series OR a category directly (never
 * both), so this offers one combined dropdown instead of two separate
 * pickers that would need to keep each other in sync.
 */
export function TargetSelect({
  value,
  onChange,
  seriesList,
  categoryList,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  seriesList: SeriesOption[];
  categoryList: CategoryOption[];
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={
        className ?? "rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      }
    >
      <option value="">Unassigned</option>
      <optgroup label="Series">
        {seriesList.map((s) => (
          <option key={`s:${s.id}`} value={`s:${s.id}`}>
            {s.title}
          </option>
        ))}
      </optgroup>
      <optgroup label="Categories">
        {categoryList.map((c) => (
          <option key={`c:${c.id}`} value={`c:${c.id}`}>
            {c.name}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
