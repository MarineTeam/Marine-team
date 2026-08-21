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

  it("only lights Home up on Home", () => {
    expect(isActivePath("/", "/", true)).toBe(true);
    expect(isActivePath("/series", "/", true)).toBe(false);
    // Belt and braces: the segment rule already stops "/" claiming "/series",
    // which would take a path starting "//".
    expect(isActivePath("/series", "/")).toBe(false);
  });

  it("keeps an overview from staying lit on the pages under it", () => {
    // The reason the flag exists: /profile and /admin sit above their own
    // siblings in the nav, so without it two links are marked at once.
    expect(isActivePath("/profile/inbox", "/profile")).toBe(true);
    expect(isActivePath("/profile/inbox", "/profile", true)).toBe(false);
    expect(isActivePath("/profile", "/profile", true)).toBe(true);
  });
});
