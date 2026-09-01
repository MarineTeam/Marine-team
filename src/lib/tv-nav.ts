/**
 * Moving around with a remote control.
 *
 * A television has four arrows, OK and Back. There is no pointer, no scroll
 * wheel and no way to tab through a page - so focus is a position in a grid
 * that the app itself keeps, and every key is a move from where you are.
 *
 * Pure, so the rules can be driven by a test rather than by pressing buttons
 * at a television.
 */

export type Position = { row: number; column: number };

/** How many items are in each row, top to bottom. */
export type Rows = readonly number[];

export type Direction = "up" | "down" | "left" | "right";

/**
 * Where a keypress moves focus.
 *
 * Two rules that a naive grid gets wrong, and that anybody who has used a
 * television notices immediately:
 *
 *   - **Nothing wraps.** Pressing right at the end of a row must stop, not
 *     jump to the start. On a pointer-less device, focus appearing at the
 *     other end of the screen is disorienting - you have no idea where it went.
 *   - **Moving between rows keeps your column where it can.** Coming down out
 *     of item five into a row of three lands on the last one, not the first:
 *     the eye is already at the right of the screen.
 */
export function move(rows: Rows, at: Position, direction: Direction): Position {
  const clampRow = (row: number) => Math.max(0, Math.min(rows.length - 1, row));
  const inRow = (row: number, column: number) => Math.max(0, Math.min((rows[row] ?? 1) - 1, column));

  if (rows.length === 0) return { row: 0, column: 0 };

  if (direction === "left") {
    return { row: at.row, column: Math.max(0, at.column - 1) };
  }
  if (direction === "right") {
    return { row: at.row, column: inRow(at.row, at.column + 1) };
  }

  const row = clampRow(at.row + (direction === "down" ? 1 : -1));
  // An empty row is skipped rather than swallowing focus.
  if ((rows[row] ?? 0) === 0) return at;
  return { row, column: inRow(row, at.column) };
}

/** The remote's arrows, and the keyboard equivalents somebody testing will use. */
export function directionOf(key: string): Direction | null {
  switch (key) {
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    default:
      return null;
  }
}

/** OK on a remote arrives as one of these, depending on the platform. */
export function isSelectKey(key: string): boolean {
  return key === "Enter" || key === " " || key === "Select";
}

/** Back, which every television has and no browser agrees on the name of. */
export function isBackKey(key: string): boolean {
  return key === "Escape" || key === "Backspace" || key === "GoBack" || key === "BrowserBack";
}

/** Whether a position is inside the grid at all. */
export function isValid(rows: Rows, at: Position): boolean {
  return at.row >= 0 && at.row < rows.length && at.column >= 0 && at.column < (rows[at.row] ?? 0);
}

/** The first place focus can go, for a grid whose first rows may be empty. */
export function firstFocusable(rows: Rows): Position {
  const row = rows.findIndex((count) => count > 0);
  return row === -1 ? { row: 0, column: 0 } : { row, column: 0 };
}
