"use client";

import { useState } from "react";

/**
 * Selection state for an admin list, shared by every page that offers bulk
 * actions so they behave the same way.
 *
 * The selection is intersected with what's currently listed on every read
 * rather than being pruned on change. Rows come and go underneath it — a
 * filter is typed, a row is deleted, a reload drops something — and an id
 * that has scrolled out of the list must not still be acted on just because
 * it was ticked earlier. Keeping the raw set means a row that comes *back*
 * (a filter is cleared) returns still ticked, which is what someone who
 * narrowed the list to find it would expect.
 */
export function useBulkSelect(ids: string[]) {
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const selected = ids.filter((id) => picked.has(id));
  const allSelected = ids.length > 0 && selected.length === ids.length;

  return {
    selected,
    count: selected.length,
    allSelected,
    isSelected: (id: string) => picked.has(id),
    toggle: (id: string) =>
      setPicked((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    toggleAll: () => setPicked(allSelected ? new Set() : new Set(ids)),
    clear: () => setPicked(new Set()),
  };
}

/**
 * Runs an action over every selected row, reporting how many failed rather
 * than stopping at the first one: a bulk action that dies halfway leaves
 * the admin guessing which half went through.
 */
export async function runBulk(
  ids: string[],
  action: (id: string) => Promise<unknown>,
): Promise<{ ok: number; failed: number }> {
  const results = await Promise.allSettled(ids.map(action));
  const failed = results.filter((r) => r.status === "rejected").length;
  return { ok: results.length - failed, failed };
}

/** Throws on a non-OK response so runBulk counts it as a failure. */
export async function bulkFetch(url: string, init?: RequestInit): Promise<void> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status}`);
}

/** A checkbox for one row, labelled for screen readers by what it selects. */
export function BulkCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={`Select ${label}`}
      className="shrink-0"
    />
  );
}

/** "Select all" for a list's header row. */
export function BulkSelectAll({
  allSelected,
  onToggle,
  disabled,
}: {
  allSelected: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-zinc-500">
      <input type="checkbox" checked={allSelected} onChange={onToggle} disabled={disabled} />
      Select all
    </label>
  );
}

/**
 * The action bar shown once something is ticked. Renders nothing at zero,
 * so a list with no selection looks exactly as it did before.
 */
export function BulkBar({
  count,
  onClear,
  busy,
  children,
}: {
  count: number;
  onClear: () => void;
  busy?: boolean;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
      <span>
        {count} selected{busy ? " — working…" : ""}
      </span>
      <div className={`flex flex-wrap items-center gap-2 ${busy ? "pointer-events-none opacity-50" : ""}`}>
        {children}
      </div>
      <button onClick={onClear} disabled={busy} className="ml-auto text-zinc-500 hover:underline">
        Clear selection
      </button>
    </div>
  );
}

/** A button inside a BulkBar; `danger` marks the destructive one. */
export function BulkButton({
  onClick,
  children,
  danger,
}: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-2 py-1 ${
        danger
          ? "border-red-300 text-red-600 dark:border-red-900"
          : "border-zinc-300 dark:border-zinc-700"
      }`}
    >
      {children}
    </button>
  );
}
