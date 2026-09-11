import { describe, it, expect } from "vitest";
import { viewKey } from "./view-key";

describe("viewKey", () => {
  it("is stable for the same address under the same secret", () => {
    expect(viewKey("203.0.113.9", "s")).toBe(viewKey("203.0.113.9", "s"));
  });

  it("differs by address and by secret", () => {
    expect(viewKey("203.0.113.9", "s")).not.toBe(viewKey("203.0.113.10", "s"));
    expect(viewKey("203.0.113.9", "s")).not.toBe(viewKey("203.0.113.9", "t"));
  });

  it("is not the address, and is short enough to index", () => {
    const key = viewKey("203.0.113.9", "s");
    expect(key).not.toContain("203");
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it("is null with nothing to key on", () => {
    expect(viewKey(null, "s")).toBeNull();
    expect(viewKey("  ", "s")).toBeNull();
    expect(viewKey(undefined, "s")).toBeNull();
  });
});
