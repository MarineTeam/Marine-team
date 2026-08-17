import { describe, expect, it } from "vitest";

// Only the pure rule functions are exercised here — the DB-backed helpers in
// these modules are covered by the routes that use them.
const { shareLinkPolicy, parseRecipientEmails, expiryFromDays } = await import("./share-links");
const { shareLinkStatus } = await import("./share-access");

describe("shareLinkPolicy", () => {
  it("lets anyone share content that is already public, granting nothing", () => {
    expect(
      shareLinkPolicy({ canShareRestricted: false, targetIsRestricted: false, grantAccessRequested: false }),
    ).toEqual({ allowed: true, grantsAccess: false });
  });

  it("lets a plain member share restricted content as a plain link", () => {
    // No override asked for, so nothing is being handed out: the link only
    // opens for someone who already has access.
    expect(
      shareLinkPolicy({ canShareRestricted: false, targetIsRestricted: true, grantAccessRequested: false }),
    ).toEqual({ allowed: true, grantsAccess: false });
  });

  it("refuses a plain member asking to override a restriction", () => {
    const result = shareLinkPolicy({
      canShareRestricted: false,
      targetIsRestricted: true,
      grantAccessRequested: true,
    });
    expect(result.allowed).toBe(false);
  });

  it("grants access when a permitted sharer asks for the override", () => {
    expect(
      shareLinkPolicy({ canShareRestricted: true, targetIsRestricted: true, grantAccessRequested: true }),
    ).toEqual({ allowed: true, grantsAccess: true });
  });

  it("withholds the grant when a permitted sharer doesn't ask for it", () => {
    // The capability is permission to override, not an automatic one — an
    // admin sending an ordinary link should be sending an ordinary link.
    expect(
      shareLinkPolicy({ canShareRestricted: true, targetIsRestricted: true, grantAccessRequested: false }),
    ).toEqual({ allowed: true, grantsAccess: false });
  });

  it("ignores an override asked for on content that isn't restricted", () => {
    // Nothing to grant, so the link stays an ordinary one — which keeps it out
    // of the grant lookup in getShareGrants entirely.
    expect(
      shareLinkPolicy({ canShareRestricted: true, targetIsRestricted: false, grantAccessRequested: true }),
    ).toEqual({ allowed: true, grantsAccess: false });
  });
});

describe("shareLinkStatus", () => {
  const now = new Date("2026-08-17T12:00:00Z");
  const publicLink = { visibility: "PUBLIC" as const, revokedAt: null, expiresAt: null, recipients: [] };
  const privateLink = {
    visibility: "EMAIL" as const,
    revokedAt: null,
    expiresAt: null,
    recipients: [{ email: "friend@example.com" }],
  };

  it("reports an unknown token as invalid", () => {
    expect(shareLinkStatus(null, null, now)).toBe("invalid");
  });

  it("opens a public link for a visitor who isn't logged in", () => {
    expect(shareLinkStatus(publicLink, null, now)).toBe("ok");
  });

  it("reports a revoked link as revoked, ahead of any other check", () => {
    expect(shareLinkStatus({ ...publicLink, revokedAt: now }, null, now)).toBe("revoked");
  });

  it("treats an expiry exactly now as expired", () => {
    expect(shareLinkStatus({ ...publicLink, expiresAt: now }, null, now)).toBe("expired");
  });

  it("still opens a link whose expiry is in the future", () => {
    const later = new Date("2026-08-18T12:00:00Z");
    expect(shareLinkStatus({ ...publicLink, expiresAt: later }, null, now)).toBe("ok");
  });

  it("sends an anonymous visitor to log in for a private link", () => {
    expect(shareLinkStatus(privateLink, null, now)).toBe("login_required");
  });

  it("opens a private link for a listed recipient, whatever the case of their email", () => {
    expect(shareLinkStatus(privateLink, "Friend@Example.com", now)).toBe("ok");
  });

  it("refuses a private link for someone it wasn't shared with", () => {
    expect(shareLinkStatus(privateLink, "stranger@example.com", now)).toBe("forbidden");
  });

  it("prefers revoked over the recipient check, so a revoked link leaks nothing about who it was for", () => {
    expect(shareLinkStatus({ ...privateLink, revokedAt: now }, "stranger@example.com", now)).toBe("revoked");
  });
});

describe("parseRecipientEmails", () => {
  it("splits on commas, semicolons, and whitespace alike", () => {
    expect(parseRecipientEmails("a@x.com, b@x.com; c@x.com\nd@x.com")).toEqual([
      "a@x.com",
      "b@x.com",
      "c@x.com",
      "d@x.com",
    ]);
  });

  it("lowercases and de-duplicates, so the unique index can't trip", () => {
    expect(parseRecipientEmails("Bob@X.com, bob@x.com")).toEqual(["bob@x.com"]);
  });

  it("drops anything that isn't an email address", () => {
    expect(parseRecipientEmails("nope, ,a@x.com")).toEqual(["a@x.com"]);
  });

  it("returns nothing for empty input", () => {
    expect(parseRecipientEmails("")).toEqual([]);
    expect(parseRecipientEmails("   ")).toEqual([]);
  });
});

describe("expiryFromDays", () => {
  it("treats null, undefined, and 0 as never expiring", () => {
    expect(expiryFromDays(null)).toBeNull();
    expect(expiryFromDays(undefined)).toBeNull();
    expect(expiryFromDays(0)).toBeNull();
  });

  it("returns a date the given number of days out", () => {
    const expiry = expiryFromDays(7);
    const days = (expiry!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeCloseTo(7, 3);
  });
});
