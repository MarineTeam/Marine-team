import { describe, expect, it } from "vitest";
import { reorderArray } from "./reorder";

describe("reorderArray", () => {
  it("moves an item later in the list, shifting items between", () => {
    expect(reorderArray(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an item earlier in the list, shifting items between", () => {
    expect(reorderArray(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("returns the same array reference when the target index is unchanged", () => {
    const items = ["a", "b", "c"];
    expect(reorderArray(items, 1, 1)).toBe(items);
  });

  it("clamps a target index past the end of the list", () => {
    expect(reorderArray(["a", "b", "c"], 0, 99)).toEqual(["b", "c", "a"]);
  });

  it("clamps a negative target index to the start of the list", () => {
    expect(reorderArray(["a", "b", "c"], 2, -5)).toEqual(["c", "a", "b"]);
  });

  it("does not mutate the input array", () => {
    const items = ["a", "b", "c"];
    reorderArray(items, 0, 2);
    expect(items).toEqual(["a", "b", "c"]);
  });
});
