import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Hashing for the optional passphrase on a share link.
 *
 * scrypt from node:crypto rather than a bcrypt/argon2 dependency, matching how
 * the rest of this codebase talks to services directly instead of pulling in a
 * library (see bunny.ts, email.ts). A share passphrase is a low-value secret
 * shared between a handful of people, but it still gets a per-link salt and a
 * timing-safe comparison — the hash sits in a row that gets backed up and
 * dumped like any other.
 *
 * Kept in its own module so the password path isn't dragged into every page
 * render: share-access.ts is imported by content.ts, and nothing on a normal
 * page needs scrypt.
 */

/** Short enough for something typed off a printed sheet, long enough not to be guessed at once. */
export const SHARE_PASSWORD_MIN_LENGTH = 6;
export const SHARE_PASSWORD_MAX_LENGTH = 128;

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const FORMAT = "scrypt";

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/** Stored as `scrypt$<salt hex>$<key hex>`, so the format is self-describing if it ever changes. */
export async function hashSharePassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt);
  return `${FORMAT}$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifySharePassword(password: string, stored: string): Promise<boolean> {
  const [format, saltHex, keyHex] = stored.split("$");
  if (format !== FORMAT || !saltHex || !keyHex) return false;

  const expected = Buffer.from(keyHex, "hex");
  const actual = await deriveKey(password, Buffer.from(saltHex, "hex"));
  // Guard the length first: timingSafeEqual throws on a mismatch rather than
  // returning false, which would turn a corrupt row into a 500.
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/** How many wrong guesses a link tolerates before it stops answering for a while. */
export const MAX_UNLOCK_ATTEMPTS = 10;

/** How long a link stays locked after that, and the window the attempts are counted over. */
export const UNLOCK_LOCKOUT_SECONDS = 15 * 60;

/**
 * Whether the last wrong guess is recent enough to still count. Also decides
 * whether a new failure adds to the tally or starts a fresh one, so ten wrong
 * guesses spread over a year never add up to a lockout.
 */
export function isWithinUnlockWindow(lastFailedUnlockAt: Date | null, now: Date = new Date()): boolean {
  if (!lastFailedUnlockAt) return false;
  return now.getTime() - lastFailedUnlockAt.getTime() < UNLOCK_LOCKOUT_SECONDS * 1000;
}

/**
 * Whether a link is currently refusing unlock attempts. Pure, so the brake's
 * behavior is testable: the count only matters while the last failure is
 * recent, which means a link locked out an hour ago quietly forgives itself
 * rather than needing a reset written to it.
 */
export function isUnlockLockedOut(
  link: { failedUnlockAttempts: number; lastFailedUnlockAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (link.failedUnlockAttempts < MAX_UNLOCK_ATTEMPTS) return false;
  return isWithinUnlockWindow(link.lastFailedUnlockAt, now);
}
