import { describe, it, expect } from "vitest";
import { canChangeRole, canDeleteUser, canSetAuthorized, firstRefusal } from "./user-admin";

const admin = { id: "boss", role: "ADMIN" as const };
const staff = { id: "staff", role: "MEMBER" as const }; // holds manage_users
const otherAdmin = { id: "boss2", role: "ADMIN" as const };
const member = { id: "mem", role: "MEMBER" as const };

describe("canChangeRole", () => {
  it("lets an admin do anything", () => {
    expect(canChangeRole(admin, member, "ADMIN").ok).toBe(true);
    expect(canChangeRole(admin, otherAdmin, "MEMBER").ok).toBe(true);
  });

  it("still refuses a non-admin granting ADMIN", () => {
    expect(canChangeRole(staff, member, "ADMIN")).toMatchObject({ ok: false, status: 403 });
  });

  it("refuses a non-admin *taking away* ADMIN — the half that was missing", () => {
    // manage_users could demote every administrator and leave nobody able to
    // let anyone back in.
    expect(canChangeRole(staff, otherAdmin, "MEMBER")).toMatchObject({ ok: false, status: 403 });
  });

  it("leaves ordinary member edits alone", () => {
    expect(canChangeRole(staff, member, "MEMBER").ok).toBe(true);
    expect(canChangeRole(staff, member, undefined).ok).toBe(true);
  });

  it("treats a no-op on an admin as a no-op", () => {
    expect(canChangeRole(staff, otherAdmin, "ADMIN").ok).toBe(true);
  });
});

describe("canDeleteUser", () => {
  it("refuses deleting yourself, whoever you are", () => {
    expect(canDeleteUser(admin, admin)).toMatchObject({ ok: false, status: 400 });
    expect(canDeleteUser(staff, staff)).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses a non-admin deleting an admin — the route checked nothing at all", () => {
    expect(canDeleteUser(staff, otherAdmin)).toMatchObject({ ok: false, status: 403 });
  });

  it("lets an admin delete another admin, and staff delete a member", () => {
    expect(canDeleteUser(admin, otherAdmin).ok).toBe(true);
    expect(canDeleteUser(staff, member).ok).toBe(true);
  });
});

describe("canSetAuthorized", () => {
  it("refuses revoking your own access", () => {
    expect(canSetAuthorized(staff, staff, false)).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses a non-admin suspending an admin — same lockout by another door", () => {
    expect(canSetAuthorized(staff, otherAdmin, false)).toMatchObject({ ok: false, status: 403 });
  });

  it("allows granting access to anybody, and suspending a member", () => {
    expect(canSetAuthorized(staff, otherAdmin, true).ok).toBe(true);
    expect(canSetAuthorized(staff, member, false).ok).toBe(true);
    expect(canSetAuthorized(staff, member, undefined).ok).toBe(true);
  });
});

describe("firstRefusal", () => {
  it("reports the first thing that was wrong, and nothing when all pass", () => {
    const bad = { ok: false, status: 403, error: "no" } as const;
    const worse = { ok: false, status: 400, error: "also no" } as const;
    expect(firstRefusal({ ok: true }, bad, worse)).toBe(bad);
    expect(firstRefusal({ ok: true }, { ok: true }).ok).toBe(true);
  });
});
