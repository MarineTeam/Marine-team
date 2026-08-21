import { describe, expect, it } from "vitest";
import { isActivePath } from "./active-path";

describe("isActivePath", () => {
  it("matches a section and everything under it", () => {
    expect(isActivePath("/series", "/series")).toBe(true);
    expect(isActivePath("/series/advent", "/series")).toBe(true);
  });

  it("stops at a segment boundary", () => {
    expect(isActivePath("/series-archive", "/series")).toBe(false);
    expect(isActivePath("/recently-played", "/recently-added")).toBe(false);
  });

  it("only matches Home exactly, or Home would light up everywhere", () => {
    expect(isActivePath("/", "/", true)).toBe(true);
    expect(isActivePath("/series", "/", true)).toBe(false);
    // The reason the flag exists: without it, every path starts with "/".
    expect(isActivePath("/series", "/")).toBe(true);
  });
});
