import { describe, expect, it } from "vitest";
import { isMirrorEligible, publicPathFor, type MirrorCandidate } from "./podcast-mirror";

const NOW = new Date("2026-08-21T12:00:00Z");

/** An episode that should be mirrored; each test spoils exactly one thing. */
function eligible(overrides: Partial<MirrorCandidate> = {}): MirrorCandidate {
  return {
    podcastPublished: true,
    published: true,
    hidden: false,
    deletedAt: null,
    publishAt: null,
    unpublishAt: null,
    memberOnly: false,
    mimeType: "audio/mpeg",
    series: { memberOnly: false, published: true, hidden: false, deletedAt: null },
    ...overrides,
  };
}

describe("isMirrorEligible", () => {
  it("accepts a published, public audio file in a public series", () => {
    expect(isMirrorEligible(eligible(), NOW)).toBe(true);
  });

  it("requires the admin to have opted in", () => {
    // The whole point of the opt-in: eligible in every other respect is not
    // enough to put a file on a permanently public URL.
    expect(isMirrorEligible(eligible({ podcastPublished: false }), NOW)).toBe(false);
  });

  it("refuses a members-only file", () => {
    expect(isMirrorEligible(eligible({ memberOnly: true }), NOW)).toBe(false);
  });

  it("refuses a file whose series is members-only", () => {
    expect(
      isMirrorEligible(eligible({ series: { memberOnly: true, published: true, hidden: false, deletedAt: null } }), NOW),
    ).toBe(false);
  });

  it("refuses when the series is unpublished, hidden or trashed", () => {
    for (const series of [
      { memberOnly: false, published: false, hidden: false, deletedAt: null },
      { memberOnly: false, published: true, hidden: true, deletedAt: null },
      { memberOnly: false, published: true, hidden: false, deletedAt: NOW },
    ]) {
      expect(isMirrorEligible(eligible({ series }), NOW)).toBe(false);
    }
  });

  it("refuses when the file itself is unpublished, hidden or trashed", () => {
    expect(isMirrorEligible(eligible({ published: false }), NOW)).toBe(false);
    expect(isMirrorEligible(eligible({ hidden: true }), NOW)).toBe(false);
    expect(isMirrorEligible(eligible({ deletedAt: NOW }), NOW)).toBe(false);
  });

  it("respects a publish schedule that hasn't started", () => {
    expect(isMirrorEligible(eligible({ publishAt: new Date("2026-09-01T00:00:00Z") }), NOW)).toBe(false);
    expect(isMirrorEligible(eligible({ publishAt: new Date("2026-08-01T00:00:00Z") }), NOW)).toBe(true);
  });

  it("respects an expiry that has passed", () => {
    expect(isMirrorEligible(eligible({ unpublishAt: new Date("2026-08-01T00:00:00Z") }), NOW)).toBe(false);
    expect(isMirrorEligible(eligible({ unpublishAt: new Date("2026-09-01T00:00:00Z") }), NOW)).toBe(true);
  });

  it("only mirrors audio", () => {
    expect(isMirrorEligible(eligible({ mimeType: "application/pdf" }), NOW)).toBe(false);
    expect(isMirrorEligible(eligible({ mimeType: null }), NOW)).toBe(false);
  });

  it("refuses a file with no series, which has no feed to appear in", () => {
    expect(isMirrorEligible(eligible({ series: null }), NOW)).toBe(false);
  });
});

describe("publicPathFor", () => {
  it("namespaces by file id so the zone's contents are self-describing", () => {
    expect(publicPathFor("abc123", "files/uuid-sermon.mp3")).toBe("podcast/abc123/uuid-sermon.mp3");
  });

  it("falls back to the id when the source path has no filename", () => {
    expect(publicPathFor("abc123", "")).toBe("podcast/abc123/abc123");
  });
});
