import { describe, expect, it, vi } from "vitest";

// The DB-backed helpers in this module reach for prisma at import time via
// content.ts; only the pure resolution rules are exercised here.
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/content", () => ({ categoryChainIds: vi.fn() }));
vi.mock("@/lib/plugins", () => ({ isPluginEnabled: vi.fn() }));

const { resolveDownloadEnabled, isPlatformAllowed, isAudienceAllowed } = await import("./downloads");

describe("resolveDownloadEnabled", () => {
  it("allows by default when nothing anywhere has an opinion", () => {
    // The plugin being on is the site-level yes; an untouched library
    // shouldn't need every video ticked individually.
    expect(resolveDownloadEnabled({})).toBe(true);
    expect(resolveDownloadEnabled({ video: null, series: null, categories: [null, null] })).toBe(true);
  });

  it("lets the video override its series and category", () => {
    expect(resolveDownloadEnabled({ video: false, series: true, categories: [true] })).toBe(false);
    expect(resolveDownloadEnabled({ video: true, series: false, categories: [false] })).toBe(true);
  });

  it("falls to the series when the video is inheriting", () => {
    expect(resolveDownloadEnabled({ video: null, series: false, categories: [true] })).toBe(false);
    expect(resolveDownloadEnabled({ video: null, series: true, categories: [false] })).toBe(true);
  });

  it("uses the nearest category with an opinion, not the root", () => {
    // Nearest-first, matching how getPluginStates resolves category overrides.
    expect(resolveDownloadEnabled({ video: null, series: null, categories: [true, false] })).toBe(true);
    expect(resolveDownloadEnabled({ video: null, series: null, categories: [false, true] })).toBe(false);
  });

  it("skips inheriting categories to reach an ancestor that decided", () => {
    expect(resolveDownloadEnabled({ video: null, series: null, categories: [null, null, false] })).toBe(false);
  });

  it("treats an explicit false as a block, not as absent", () => {
    // The whole reason the column is nullable: false must not read as "unset".
    expect(resolveDownloadEnabled({ video: false })).toBe(false);
    expect(resolveDownloadEnabled({ series: false })).toBe(false);
  });
});

describe("isPlatformAllowed", () => {
  it("allows everywhere on BOTH", () => {
    expect(isPlatformAllowed("BOTH", "web")).toBe(true);
    expect(isPlatformAllowed("BOTH", "pwa")).toBe(true);
  });

  it("restricts to the installed app on PWA", () => {
    expect(isPlatformAllowed("PWA", "pwa")).toBe(true);
    expect(isPlatformAllowed("PWA", "web")).toBe(false);
  });

  it("restricts to the browser on WEB", () => {
    expect(isPlatformAllowed("WEB", "web")).toBe(true);
    expect(isPlatformAllowed("WEB", "pwa")).toBe(false);
  });
});

describe("isAudienceAllowed", () => {
  const base = {
    isAdmin: false,
    userGroupIds: [] as string[],
    allowedGroupIds: [] as string[],
    allowedUserIds: [] as string[],
    userId: "u1",
  };

  it("allows any member when the audience is everyone", () => {
    expect(isAudienceAllowed({ ...base, audience: "ALL_MEMBERS" })).toBe(true);
  });

  it("refuses a member outside the lists when the audience is specific", () => {
    expect(isAudienceAllowed({ ...base, audience: "SPECIFIC" })).toBe(false);
  });

  it("allows a named individual", () => {
    expect(isAudienceAllowed({ ...base, audience: "SPECIFIC", allowedUserIds: ["u1"] })).toBe(true);
  });

  it("allows a member of a listed group", () => {
    expect(
      isAudienceAllowed({
        ...base,
        audience: "SPECIFIC",
        userGroupIds: ["g2"],
        allowedGroupIds: ["g1", "g2"],
      }),
    ).toBe(true);
  });

  it("refuses a member whose groups aren't listed", () => {
    expect(
      isAudienceAllowed({ ...base, audience: "SPECIFIC", userGroupIds: ["g3"], allowedGroupIds: ["g1"] }),
    ).toBe(false);
  });

  it("always allows an admin, whatever the lists say", () => {
    expect(isAudienceAllowed({ ...base, audience: "SPECIFIC", isAdmin: true })).toBe(true);
  });
});
