/**
 * Signing a television in, when the only input device is a remote control.
 *
 * This is the device authorization grant (RFC 8628) in the shape this app
 * needs. The television asks for a pairing and is given two things:
 *
 *   - a **user code**, short and readable across a room, which it puts on the
 *     screen for somebody to type on their phone;
 *   - a **device code**, long and secret, which only the television ever sees.
 *
 * The television then polls, holding up the device code, until a member has
 * approved that user code. Keeping those two apart is the whole security
 * design: the user code is on a screen in a room that may hold a hundred
 * people, so it cannot be the thing that redeems a token.
 *
 * Nothing here touches the database or the clock beyond what it is given, so
 * every rule below can be driven directly by a test.
 */

/**
 * The alphabet a code is drawn from.
 *
 * No 0/O, no 1/I/L, no 5/S, no 8/B: a code is read off a television from six
 * feet away and typed with a remote's on-screen keyboard, and every one of
 * those pairs is a support call. Twenty-seven characters, which still gives
 * 27^6 - about 387 million - for a window that lasts ten minutes.
 */
export const CODE_ALPHABET = "ACDEFGHJKMNPQRTUVWXYZ234679";

export const CODE_LENGTH = 6;

/** How long a code on a screen is worth anything. */
export const CODE_TTL_MS = 10 * 60 * 1000;

/** How often a television should ask. Seconds, and it is told this. */
export const POLL_INTERVAL_SECONDS = 5;

/** Formats a code the way it is shown: "K7P-9QM" reads back better than "K7P9QM". */
export function formatUserCode(code: string): string {
  const half = Math.ceil(code.length / 2);
  return `${code.slice(0, half)}-${code.slice(half)}`;
}

/**
 * Reads a code somebody typed.
 *
 * Forgiving in every direction a person will get it wrong: lower case, the
 * dash left in or out, spaces from a remote's keyboard. Characters the
 * alphabet deliberately excludes are mapped to the ones they look like, so
 * typing the letter O where the screen showed a Q still finds the code rather
 * than saying "no such code" - the screen cannot have shown an O, because O
 * is not in the alphabet.
 */
const LOOKALIKES: Record<string, string> = {
  "0": "Q",
  O: "Q",
  "1": "7",
  I: "7",
  L: "7",
  "5": "6",
  S: "6",
  "8": "9",
  B: "9",
};

export function normalizeUserCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .split("")
    .map((character) =>
      CODE_ALPHABET.includes(character) ? character : (LOOKALIKES[character] ?? character),
    )
    .join("")
    .slice(0, CODE_LENGTH);
}

export function isWellFormedUserCode(code: string): boolean {
  return (
    code.length === CODE_LENGTH && [...code].every((character) => CODE_ALPHABET.includes(character))
  );
}

/** A code from bytes a caller supplies, so the randomness is the caller's problem and testable. */
export function userCodeFromBytes(bytes: Uint8Array): string {
  let code = "";
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[bytes[index % bytes.length] % CODE_ALPHABET.length];
  }
  return code;
}

export type PairingStatus = "PENDING" | "APPROVED" | "DENIED" | "LINKED" | "REVOKED";

export type PollAnswer =
  | { state: "pending"; interval: number }
  | { state: "denied" }
  | { state: "expired" }
  | { state: "ready" }
  /** Already exchanged. A second attempt must not mint a second token. */
  | { state: "spent" };

/**
 * What to tell a television that is asking.
 *
 * Expiry is checked before "approved" on purpose: a pairing approved eleven
 * minutes ago and never collected is expired, not ready. Otherwise a code
 * somebody approved and walked away from stays redeemable for ever.
 */
export function pollAnswer(
  device: { status: PairingStatus; expiresAt: Date },
  now: Date = new Date(),
): PollAnswer {
  if (device.status === "DENIED") return { state: "denied" };
  if (device.status === "REVOKED") return { state: "expired" };
  if (device.status === "LINKED") return { state: "spent" };
  if (now.getTime() > device.expiresAt.getTime()) return { state: "expired" };
  if (device.status === "APPROVED") return { state: "ready" };
  return { state: "pending", interval: POLL_INTERVAL_SECONDS };
}

/** Whether a member may still act on a code they have typed in. */
export function canApprove(
  device: { status: PairingStatus; expiresAt: Date },
  now: Date = new Date(),
): boolean {
  return device.status === "PENDING" && now.getTime() <= device.expiresAt.getTime();
}

/**
 * What the approval screen says the member is about to do.
 *
 * Names the device, because the one attack this flow cannot design away is
 * somebody being talked into typing a code from a screen that is not theirs.
 * The defence is that the person is told exactly what they are approving, in
 * a sentence rather than a checkbox.
 */
export function approvalPrompt(deviceName: string): string {
  return `Sign "${deviceName}" in to your account? Only do this if you are looking at this code on your own television.`;
}

/**
 * A device name a device supplied, made safe to print.
 *
 * Whitespace of every kind collapses to single spaces: a name is dropped into
 * a sentence a person is asked to agree to, and a device that could put line
 * breaks in it could write its own second sentence.
 */
export function cleanDeviceName(raw: string | null | undefined): string {
  const cleaned = (raw ?? "").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 60) || "A television";
}
