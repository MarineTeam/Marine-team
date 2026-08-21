"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Whether a keystroke is going into something the person is typing in, and
 * so isn't a list shortcut. Checkboxes and buttons are inputs too but hold
 * no text, so a shortcut pressed while one has focus still counts — which
 * matters, since ticking a row is exactly what puts focus there.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === "TEXTAREA" || target.tagName === "SELECT") return true;
  if (target.tagName !== "INPUT") return false;
  const type = (target as HTMLInputElement).type;
  return type !== "checkbox" && type !== "radio" && type !== "button" && type !== "submit";
}

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
  // The last row ticked, for shift-click range selection.
  const anchorRef = useRef<string | null>(null);
  // Read through refs inside the key handler so it binds once instead of
  // on every render — `ids` is a fresh array each time.
  const idsRef = useRef(ids);
  const countRef = useRef(0);

  const selected = ids.filter((id) => picked.has(id));
  const allSelected = ids.length > 0 && selected.length === ids.length;

  // Synced after the commit rather than during render: both are only ever
  // read from a handler, which runs later still.
  useEffect(() => {
    idsRef.current = ids;
    countRef.current = selected.length;
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
        // Takes over the browser's "select all text", which on an admin
        // list is never what's wanted.
        event.preventDefault();
        setPicked(new Set(idsRef.current));
        return;
      }
      // Only swallowed when there's a selection to clear, so Escape still
      // reaches whatever else might want it.
      if (event.key === "Escape" && countRef.current > 0) {
        event.preventDefault();
        setPicked(new Set());
        anchorRef.current = null;
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return {
    selected,
    count: selected.length,
    allSelected,
    isSelected: (id: string) => picked.has(id),
    /**
     * Ticks one row, or — held with shift — everything between it and the
     * last row ticked. A shift-range only ever adds, matching how file
     * lists behave: extending a selection shouldn't punch holes in it.
     */
    toggle: (id: string, shiftKey = false) => {
      const current = idsRef.current;
      const anchor = anchorRef.current;
      setPicked((previous) => {
        const next = new Set(previous);
        if (shiftKey && anchor && anchor !== id) {
          const from = current.indexOf(anchor);
          const to = current.indexOf(id);
          if (from !== -1 && to !== -1) {
            for (let i = Math.min(from, to); i <= Math.max(from, to); i++) next.add(current[i]);
            return next;
          }
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      anchorRef.current = id;
    },
    toggleAll: () => setPicked(allSelected ? new Set() : new Set(ids)),
    clear: () => {
      setPicked(new Set());
      anchorRef.current = null;
    },
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
  onToggle,
  label,
}: {
  checked: boolean;
  /** Passed whether shift was held, for range selection. */
  onToggle: (shiftKey: boolean) => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      // Handled on click rather than change because only the click carries
      // the modifier keys. Space on a focused checkbox fires a click too,
      // so this stays keyboard-reachable. onChange is still supplied
      // because React requires one alongside `checked`.
      onChange={() => {}}
      onClick={(event) => onToggle(event.shiftKey)}
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
    <label className="flex items-center gap-1.5 text-sm text-sec">
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
    // Sticky, and offset by the header: a selection made near the bottom of a
    // long admin list is useless once its actions have scrolled off the top.
    <div
      className="sticky z-20 flex flex-wrap items-center gap-2 rounded-lg border border-sep bg-chip p-3 text-sm shadow-sm"
      style={{ top: "var(--header-h)" }}
    >
      <span>
        {count} selected{busy ? " — working…" : ""}
      </span>
      <div className={`flex flex-wrap items-center gap-2 ${busy ? "pointer-events-none opacity-50" : ""}`}>
        {children}
      </div>
      {/* Hidden on small screens, where there's no keyboard to use them
          with and the bar needs the room. */}
      <span className="ml-auto hidden text-xs text-ter sm:inline">
        ⌘/Ctrl+A all · Shift-click range · Esc clear
      </span>
      <button onClick={onClear} disabled={busy} className="text-sec hover:underline">
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
          : "border-sep"
      }`}
    >
      {children}
    </button>
  );
}
