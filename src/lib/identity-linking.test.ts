import { describe, expect, it } from "vitest";
import { decideLinking } from "./identity-linking";

const VERIFIED = { sub: "google-oauth2|1", email: "a@church.org", emailVerified: true };
const UNVERIFIED = { ...VERIFIED, emailVerified: false };

describe("decideLinking", () => {
  it("uses the sub's own user when the identity is already known", () => {
    expect(decideLinking(VERIFIED, { userIdBySub: "u1", userIdByEmail: null })).toEqual({
      action: "existing",
      userId: "u1",
    });
  });

  it("prefers sub over email, so a provider-side email change is a rename not a new account", () => {
    // The sub belongs to u1 but the address it's presenting now belongs to
    // u2's row. Following the email here is what used to strand someone's
    // history — and, with auth0Id being unique, crash the login outright.
    expect(decideLinking(VERIFIED, { userIdBySub: "u1", userIdByEmail: "u2" })).toEqual({
      action: "existing",
      userId: "u1",
    });
  });

  it("still trusts a known sub even when its email is unverified", () => {
    // Verification guards *linking*, not returning. Demanding it here would
    // lock out anyone whose provider stopped asserting the claim.
    expect(decideLinking({ ...UNVERIFIED }, { userIdBySub: "u1", userIdByEmail: null })).toEqual({
      action: "existing",
      userId: "u1",
    });
  });

  it("links a new identity to an existing member when the email is verified", () => {
    expect(decideLinking(VERIFIED, { userIdBySub: null, userIdByEmail: "u2" })).toEqual({
      action: "link",
      userId: "u2",
    });
  });

  it("refuses to link a new identity whose email isn't verified", () => {
    // The takeover case: anyone able to create an account asserting an
    // existing member's address would otherwise inherit that member's row,
    // history and role.
    expect(decideLinking(UNVERIFIED, { userIdBySub: null, userIdByEmail: "u2" })).toEqual({
      action: "refuse",
      reason: "unverified_email_collision",
    });
  });

  it("creates a member for a genuinely new identity", () => {
    expect(decideLinking(VERIFIED, { userIdBySub: null, userIdByEmail: null })).toEqual({ action: "create" });
  });

  it("creates for an unverified identity when nothing collides with it", () => {
    // Nothing to take over, so verification isn't required to get a row of
    // one's own — access is still governed by the org and allowlist checks.
    expect(decideLinking(UNVERIFIED, { userIdBySub: null, userIdByEmail: null })).toEqual({ action: "create" });
  });
});
