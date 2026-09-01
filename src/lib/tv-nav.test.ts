import { describe, expect, it } from "vitest";
import { directionOf, firstFocusable, isBackKey, isSelectKey, isValid, move } from "./tv-nav";

/**
 * A television has four arrows, OK and Back. Everything a pointer would do
 * has to be a move from where you already are, which makes two behaviours
 * matter more than they would anywhere else.
 */

const rows = [4, 3, 6];

describe("move", () => {
  it("walks along a row", () => {
    expect(move(rows, { row: 0, column: 1 }, "right")).toEqual({ row: 0, column: 2 });
    expect(move(rows, { row: 0, column: 1 }, "left")).toEqual({ row: 0, column: 0 });
  });

  it("stops at the end of a row rather than wrapping", () => {
    // With no pointer, focus appearing at the other end of the screen leaves
    // you with no idea where it went.
    expect(move(rows, { row: 0, column: 3 }, "right")).toEqual({ row: 0, column: 3 });
    expect(move(rows, { row: 0, column: 0 }, "left")).toEqual({ row: 0, column: 0 });
  });

  it("stops at the top and the bottom", () => {
    expect(move(rows, { row: 0, column: 0 }, "up")).toEqual({ row: 0, column: 0 });
    expect(move(rows, { row: 2, column: 0 }, "down")).toEqual({ row: 2, column: 0 });
  });

  it("keeps your column when it can, moving between rows", () => {
    expect(move(rows, { row: 0, column: 2 }, "down")).toEqual({ row: 1, column: 2 });
  });

  it("lands on the last item when the row below is shorter, not the first", () => {
    // The eye is already at the right of the screen; sending focus to the
    // left of it is the jump people complain about.
    expect(move(rows, { row: 0, column: 3 }, "down")).toEqual({ row: 1, column: 2 });
  });

  it("goes back out to the column you came from, where the row is long enough", () => {
    expect(move(rows, { row: 1, column: 2 }, "down")).toEqual({ row: 2, column: 2 });
  });

  it("skips an empty row rather than letting focus vanish into it", () => {
    expect(move([3, 0, 3], { row: 0, column: 1 }, "down")).toEqual({ row: 0, column: 1 });
  });

  it("has somewhere to be even with nothing on screen", () => {
    expect(move([], { row: 0, column: 0 }, "down")).toEqual({ row: 0, column: 0 });
  });
});

describe("the remote's keys", () => {
  it("reads the four arrows", () => {
    expect(directionOf("ArrowUp")).toBe("up");
    expect(directionOf("ArrowDown")).toBe("down");
    expect(directionOf("ArrowLeft")).toBe("left");
    expect(directionOf("ArrowRight")).toBe("right");
    expect(directionOf("a")).toBe(null);
  });

  it("takes OK however the platform spells it", () => {
    expect(isSelectKey("Enter")).toBe(true);
    expect(isSelectKey(" ")).toBe(true);
    expect(isSelectKey("Select")).toBe(true);
    expect(isSelectKey("x")).toBe(false);
  });

  it("takes Back however the platform spells it", () => {
    // Every television has this key and no two browsers name it the same.
    for (const key of ["Escape", "Backspace", "GoBack", "BrowserBack"]) {
      expect(isBackKey(key)).toBe(true);
    }
    expect(isBackKey("Enter")).toBe(false);
  });
});

describe("isValid", () => {
  it("knows what is inside the grid", () => {
    expect(isValid(rows, { row: 1, column: 2 })).toBe(true);
    expect(isValid(rows, { row: 1, column: 3 })).toBe(false);
    expect(isValid(rows, { row: 3, column: 0 })).toBe(false);
    expect(isValid(rows, { row: -1, column: 0 })).toBe(false);
  });
});

describe("firstFocusable", () => {
  it("finds the first row with anything in it", () => {
    expect(firstFocusable([0, 0, 4])).toEqual({ row: 2, column: 0 });
    expect(firstFocusable([3])).toEqual({ row: 0, column: 0 });
    expect(firstFocusable([])).toEqual({ row: 0, column: 0 });
  });
});
