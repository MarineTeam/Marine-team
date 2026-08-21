import { describe, expect, it, vi } from "vitest";

// The module under test is pure apart from getBranding, which pulls in the
// database client and Next's cache wrapper at import time.
vi.mock("@/lib/db", () => ({ prisma: { brandSettings: { upsert: vi.fn() } } }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));

const { DEFAULT_BRANDING, brandingCss, hexToRgbChannels, isHexColor, normalizeBranding, normalizeHex } =
  await import("./branding");

describe("isHexColor", () => {
  it("accepts three- and six-digit hex, in either case", () => {
    expect(isHexColor("#abc")).toBe(true);
    expect(isHexColor("#1a8fd1")).toBe(true);
    expect(isHexColor("#1A8FD1")).toBe(true);
  });

  it("rejects anything that isn't one", () => {
    expect(isHexColor("1a8fd1")).toBe(false);
    expect(isHexColor("#12345")).toBe(false);
    expect(isHexColor("rebeccapurple")).toBe(false);
    expect(isHexColor("red; } body { display: none")).toBe(false);
    expect(isHexColor(null)).toBe(false);
    expect(isHexColor(42)).toBe(false);
  });
});

describe("normalizeHex", () => {
  it("expands the short form and lowercases", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("#1A8FD1")).toBe("#1a8fd1");
    expect(normalizeHex("  #1a8fd1 ")).toBe("#1a8fd1");
  });
});

describe("hexToRgbChannels", () => {
  it("splits a colour into channels for an rgba() literal", () => {
    expect(hexToRgbChannels("#1a8fd1")).toBe("26, 143, 209");
    expect(hexToRgbChannels("#fff")).toBe("255, 255, 255");
    expect(hexToRgbChannels("#000000")).toBe("0, 0, 0");
  });
});

describe("normalizeBranding", () => {
  it("falls back to the defaults for junk", () => {
    expect(normalizeBranding(null)).toEqual(DEFAULT_BRANDING);
    expect(normalizeBranding("nope")).toEqual(DEFAULT_BRANDING);
    expect(normalizeBranding({})).toEqual(DEFAULT_BRANDING);
  });

  it("keeps the fields it recognizes when others are bad", () => {
    const result = normalizeBranding({ name: "Grace Chapel", brand: "not a colour" });
    expect(result.name).toBe("Grace Chapel");
    expect(result.brand).toBe(DEFAULT_BRANDING.brand);
  });

  it("drops a colour that isn't hex rather than letting it reach the stylesheet", () => {
    const result = normalizeBranding({ brandDeep: "red; } * { display: none }" });
    expect(result.brandDeep).toBe(DEFAULT_BRANDING.brandDeep);
  });

  it("treats a blank or whitespace-only name as absent", () => {
    expect(normalizeBranding({ name: "   " }).name).toBe(DEFAULT_BRANDING.name);
  });

  it("caps a name rather than letting it break the header", () => {
    expect(normalizeBranding({ name: "x".repeat(200) }).name).toHaveLength(60);
  });

  it("accepts a same-origin path or an https logo, and nothing else", () => {
    expect(normalizeBranding({ logoUrl: "/icon.svg" }).logoUrl).toBe("/icon.svg");
    expect(normalizeBranding({ logoUrl: "https://cdn.example/logo.png" }).logoUrl).toBe(
      "https://cdn.example/logo.png",
    );
    expect(normalizeBranding({ logoUrl: "javascript:alert(1)" }).logoUrl).toBeNull();
    expect(normalizeBranding({ logoUrl: "http://example.com/logo.png" }).logoUrl).toBeNull();
    expect(normalizeBranding({ logoUrl: "" }).logoUrl).toBeNull();
  });
});

describe("brandingCss", () => {
  it("writes the chosen colours into both themes", () => {
    const css = brandingCss({ ...DEFAULT_BRANDING, brandDeep: "#0288d1", brandLight: "#4fc3f7" });
    expect(css).toContain("--accent:#0288d1");
    expect(css).toContain("--accent-rgb:2, 136, 209");
    expect(css).toContain(":root.dark{");
    // The accent flips to the light shade on dark surfaces, where the deep one
    // would be unreadable.
    expect(css.slice(css.indexOf(":root.dark{"))).toContain("--accent:#4fc3f7");
  });

  it("normalizes before interpolating, so a bad value can't reach the stylesheet", () => {
    const css = brandingCss({ ...DEFAULT_BRANDING, brand: "</style><script>" as string });
    expect(css).not.toContain("<script>");
    expect(css).toContain(`--brand:${DEFAULT_BRANDING.brand}`);
  });
});
