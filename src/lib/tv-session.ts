import crypto from "node:crypto";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { CODE_TTL_MS, cleanDeviceName, userCodeFromBytes } from "@/lib/tv-pairing";

/**
 * The database side of signing a television in.
 *
 * Secrets are stored as SHA-256 hashes rather than as themselves, for the same
 * reason a password is: a leaked database must not hand somebody a working
 * pairing or a live television session. The user code is *not* hashed — it is
 * on a screen, it is looked up by a person typing it, and hashing something
 * that public buys nothing while making the lookup impossible.
 */

function hash(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

/** Constant-time compare, so a token check can't be timed character by character. */
function sameSecret(given: string, storedHash: string): boolean {
  const givenHash = Buffer.from(hash(given));
  const stored = Buffer.from(storedHash);
  return givenHash.length === stored.length && crypto.timingSafeEqual(givenHash, stored);
}

export type NewPairing = {
  userCode: string;
  deviceCode: string;
  expiresAt: Date;
  intervalSeconds: number;
};

/**
 * Starts a pairing.
 *
 * The user code has to be unique among the ones currently live — two
 * televisions showing the same six characters would send whoever typed it to
 * the wrong one. A short retry loop is enough: with a ten-minute window a
 * church has a handful of live codes against 387 million possibilities.
 */
export async function startPairing(
  deviceName: string,
  deviceKind: string | null,
): Promise<NewPairing> {
  const deviceCode = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const userCode = userCodeFromBytes(crypto.randomBytes(8));
    const taken = await prisma.tvDevice.findUnique({ where: { userCode } });
    // A code from an expired pairing is free again: keeping six characters
    // reserved for ever would exhaust a small alphabet in a few years.
    if (taken && (taken.status === "PENDING" || taken.status === "APPROVED") && taken.expiresAt > new Date()) {
      continue;
    }
    if (taken) await prisma.tvDevice.delete({ where: { id: taken.id } });

    await prisma.tvDevice.create({
      data: {
        userCode,
        deviceCodeHash: hash(deviceCode),
        deviceName: cleanDeviceName(deviceName),
        deviceKind: deviceKind?.slice(0, 40) ?? null,
        expiresAt,
      },
    });
    return { userCode, deviceCode, expiresAt, intervalSeconds: 5 };
  }

  throw new Error("Couldn't find a free code. Try again.");
}

/** The pairing a television is holding the secret for, or null. */
export async function findByDeviceCode(deviceCode: string) {
  // Looked up by hash, which is also what makes the column indexable.
  return prisma.tvDevice.findUnique({ where: { deviceCodeHash: hash(deviceCode) } });
}

/**
 * Hands the television its token, once and only once.
 *
 * Conditional on the row still being APPROVED, so two polls arriving together
 * cannot both mint a token — the second updates nothing and is told the
 * pairing is spent.
 */
export async function claimToken(deviceId: string): Promise<string | null> {
  const token = crypto.randomBytes(32).toString("hex");
  const claimed = await prisma.tvDevice.updateMany({
    where: { id: deviceId, status: "APPROVED" },
    data: { status: "LINKED", tokenHash: hash(token), linkedAt: new Date(), lastSeenAt: new Date() },
  });
  return claimed.count === 1 ? token : null;
}

/** Whoever a television is signed in as, or null. */
export async function userForToken(token: string | null): Promise<User | null> {
  if (!token) return null;
  const device = await prisma.tvDevice.findUnique({
    where: { tokenHash: hash(token) },
    include: { user: true },
  });
  if (!device || device.status !== "LINKED" || !device.user) return null;
  // Verified again in constant time: the lookup above proves a row exists
  // with this hash, and this proves the caller holds the secret behind it.
  if (!device.tokenHash || !sameSecret(token, device.tokenHash)) return null;

  // Best-effort: a television that has been dark for a year should look it in
  // the member's list, but a failed write here must not stop it playing.
  void prisma.tvDevice
    .update({ where: { id: device.id }, data: { lastSeenAt: new Date() } })
    .catch(() => {});

  return device.user;
}

/** The televisions a member has signed in, for their own settings page. */
export async function devicesFor(userId: string) {
  return prisma.tvDevice.findMany({
    where: { userId, status: "LINKED" },
    orderBy: { linkedAt: "desc" },
    select: { id: true, deviceName: true, deviceKind: true, linkedAt: true, lastSeenAt: true },
  });
}

export async function revokeDevice(userId: string, deviceId: string): Promise<boolean> {
  const revoked = await prisma.tvDevice.updateMany({
    where: { id: deviceId, userId },
    // The token hash goes with it: a revoked row must not be resurrectable by
    // anything holding the old secret.
    data: { status: "REVOKED", tokenHash: null, revokedAt: new Date() },
  });
  return revoked.count === 1;
}

/** Clears out pairings nobody completed. Called from the daily sweep. */
export async function purgeExpiredPairings(): Promise<number> {
  const { count } = await prisma.tvDevice.deleteMany({
    where: { status: { in: ["PENDING", "APPROVED", "DENIED"] }, expiresAt: { lt: new Date() } },
  });
  return count;
}
