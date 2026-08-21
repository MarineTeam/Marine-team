"use client";

import { useState } from "react";

/**
 * HTML5 drag-and-drop reordering. Attach `handleProps(index)` to a small
 * drag-handle element (so dragging doesn't fight with clicks on buttons or
 * selects elsewhere in the row) and `dropZoneProps(index)` to the row itself.
 */
export function useDragReorder(onReorder: (fromIndex: number, toIndex: number) => void) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  function handleProps(index: number) {
    return {
      draggable: true,
      onDragStart: () => setDraggingIndex(index),
      onDragEnd: () => setDraggingIndex(null),
    };
  }

  function dropZoneProps(index: number) {
    return {
      onDragOver: (e: React.DragEvent) => e.preventDefault(),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        if (draggingIndex !== null && draggingIndex !== index) onReorder(draggingIndex, index);
        setDraggingIndex(null);
      },
    };
  }

  return { draggingIndex, handleProps, dropZoneProps };
}

/** Drag-handle grip icon; combine with `useDragReorder`'s `handleProps`. */
export function DragHandle(props: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...props}
      className="cursor-grab select-none px-1 text-ter active:cursor-grabbing"
      aria-label="Drag to reorder"
      title="Drag to reorder"
    >
      ⠿
    </span>
  );
}

/** Numeric "position" field that reorders an item by typing its target 1-based position. */
export function PositionInput({
  index,
  total,
  onReorder,
}: {
  index: number;
  total: number;
  onReorder: (toIndex: number) => void;
}) {
  return (
    <input
      type="number"
      min={1}
      max={total}
      value={index + 1}
      onChange={(e) => {
        const value = Number(e.target.value);
        if (!Number.isFinite(value) || value < 1) return;
        onReorder(value - 1);
      }}
      className="w-14 rounded-md border border-sep px-2 py-1 text-sm"
      aria-label="Position"
    />
  );
}
