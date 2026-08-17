import { describe, expect, it } from "vitest";
import {
  hashSharePassword,
  isUnlockLockedOut,
  isWithinUnlockWindow,
  MAX_UNLOCK_ATTEMPTS,
  UNLOCK_LOCKOUT_SECONDS,
  verifySharePassword,
} from "./share-password";

describe("hashSharePassword / verifySharePassword", () => {
  it("accepts the right password", async () => {
    const stored = await hashSharePassword("open sesame");
    expect(await verifySharePassword("open sesame", stored)).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const stored = await hashSharePassword("open sesame");
    expect(await verifySharePassword("Open Sesame", stored)).toBe(false);
    expect(await verifySharePassword("", stored)).toBe(false);
  });

  it("salts each hash, so the same password stores differently every time", async () => {
    expect(await hashSharePassword("same")).not.toBe(await hashSharePassword("same"));
  });

  it("treats equivalent unicode spellings as the same password", async () => {
    // Normalized before hashing, so a passphrase typed with a composed é
    // matches one typed with e + combining accent.
    const stored = await hashSharePassword("café");
    expect(await verifySharePassword("café", stored)).toBe(true);
  });

  it("returns false rather than throwing on a malformed stored value", async () => {
    expect(await verifySharePassword("x", "")).toBe(false);
    expect(await verifySharePassword("x", "not-a-hash")).toBe(false);
    expect(await verifySharePassword("x", "bcrypt$aa$bb")).toBe(false);
    expect(await verifySharePassword("x", "scrypt$aa$")).toBe(false);
    // Right format, but a key of the wrong length — must not reach
    // timingSafeEqual, which throws on mismatched buffers.
    expect(await verifySharePassword("x", "scrypt$aabb$ccdd")).toBe(false);
  });
});

describe("isWithinUnlockWindow", () => {
  const now = new Date("2026-08-17T12:00:00Z");

  it("is false when there's been no failure at all", () => {
    expect(isWithinUnlockWindow(null, now)).toBe(false);
  });

  it("is true for a failure inside the window", () => {
    expect(isWithinUnlockWindow(new Date(now.getTime() - 60_000), now)).toBe(true);
  });

  it("is false once the failure has aged out", () => {
    expect(isWithinUnlockWindow(new Date(now.getTime() - UNLOCK_LOCKOUT_SECONDS * 1000 - 1), now)).toBe(false);
  });
});

describe("isUnlockLockedOut", () => {
  const now = new Date("2026-08-17T12:00:00Z");

  it("allows attempts below the threshold", () => {
    expect(
      isUnlockLockedOut({ failedUnlockAttempts: MAX_UNLOCK_ATTEMPTS - 1, lastFailedUnlockAt: now }, now),
    ).toBe(false);
  });

  it("locks out at the threshold with a recent failure", () => {
    expect(isUnlockLockedOut({ failedUnlockAttempts: MAX_UNLOCK_ATTEMPTS, lastFailedUnlockAt: now }, now)).toBe(
      true,
    );
  });

  it("forgives itself once the lockout window passes, with no write needed", () => {
    const stale = new Date(now.getTime() - UNLOCK_LOCKOUT_SECONDS * 1000 - 1);
    expect(isUnlockLockedOut({ failedUnlockAttempts: 99, lastFailedUnlockAt: stale }, now)).toBe(false);
  });

  it("doesn't lock out on a count with no recorded failure time", () => {
    expect(isUnlockLockedOut({ failedUnlockAttempts: 99, lastFailedUnlockAt: null }, now)).toBe(false);
  });
});
