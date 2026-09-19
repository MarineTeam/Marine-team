import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizePhone } from "@/lib/sms";

/**
 * Replies to the texts this app sends — the rules, with no database near them.
 *
 * The app could already send a text and had nowhere for the answer to go, so
 * a reply to "can you do Sunday?" reached a phone in somebody's pocket and
 * stopped there. The fix is a shared inbox, and the one decision that shapes
 * it is that **a thread is a phone number, not an account.** Most of the
 * people a church texts have no account; a reply from a number nobody
 * recognises is still a reply somebody has to read, and putting it in a
 * "couldn't match" pile is how it is never read.
 */

/** The thread key: E.164 where the number can be read, as sent where it can't. */
export function threadKey(raw: string, defaultCountry?: string): string {
  return normalizePhone(raw, defaultCountry) ?? raw.trim();
}

export type Incoming = {
  providerId: string | null;
  from: string;
  body: string;
  receivedAt: Date;
};

/**
 * Reads a Twilio form post.
 *
 * Twilio posts `application/x-www-form-urlencoded`, not JSON, which is why
 * this takes parameters rather than a parsed body.
 */
export function readTwilio(params: URLSearchParams): Incoming | null {
  const from = params.get("From");
  const body = params.get("Body");
  if (!from || body === null) return null;
  return {
    providerId: params.get("MessageSid"),
    from,
    body: body.slice(0, 2000),
    receivedAt: new Date(),
  };
}

/** Reads the generic JSON shape a self-hosted gateway is asked to post. */
export function readGeneric(payload: unknown): Incoming | null {
  if (typeof payload !== "object" || payload === null) return null;
  const row = payload as { id?: unknown; from?: unknown; body?: unknown; receivedAt?: unknown };
  if (typeof row.from !== "string" || typeof row.body !== "string") return null;
  return {
    providerId: typeof row.id === "string" ? row.id : null,
    from: row.from,
    body: row.body.slice(0, 2000),
    receivedAt: typeof row.receivedAt === "string" ? new Date(row.receivedAt) : new Date(),
  };
}

/**
 * Twilio's own signature scheme.
 *
 * The URL, then every POST parameter in key order with its value appended,
 * HMAC-SHA1 under the account's auth token, base64. Written out rather than
 * pulled in as a dependency, like the giving webhook's — it is six lines
 * against a package that ships an SMS SDK to check a hash.
 */
export function twilioSignatureIsValid(input: {
  url: string;
  params: URLSearchParams;
  header: string | null;
  authToken: string;
}): boolean {
  const { url, params, header, authToken } = input;
  if (!header || !authToken) return false;

  let data = url;
  for (const key of [...params.keys()].sort()) {
    data += key + params.getAll(key).join("");
  }

  const expected = createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");
  const left = Buffer.from(header);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The shared-secret scheme for a gateway that isn't Twilio.
 *
 * The same one the giving webhook uses, for the same reasons — a timestamp
 * that stops a replay tomorrow, a constant-time compare, and no dependency.
 */
export function genericSignatureIsValid(input: {
  body: string;
  header: string | null;
  secret: string;
  now?: Date;
  toleranceSeconds?: number;
}): boolean {
  const { body, header, secret, now = new Date(), toleranceSeconds = 300 } = input;
  if (!header || !secret) return false;

  const [timestampPart, signaturePart] = header.split(",", 2);
  const timestamp = timestampPart?.startsWith("t=") ? timestampPart.slice(2) : null;
  const signature = signaturePart?.startsWith("v1=") ? signaturePart.slice(3) : null;
  if (!timestamp || !signature) return false;

  const age = Math.abs(now.getTime() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export type ThreadMessage = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  body: string;
  createdAt: Date;
  readAt: Date | null;
};

export type Thread = {
  phone: string;
  who: string | null;
  messages: ThreadMessage[];
  unread: number;
  lastAt: Date;
};

/**
 * Messages gathered into threads, most recently active first.
 *
 * An inbox sorted by unread would bury a conversation the moment somebody
 * opened it, which is exactly when they are most likely to come back to it.
 */
export function intoThreads(
  rows: readonly (ThreadMessage & { phone: string; who: string | null })[],
): Thread[] {
  const threads = new Map<string, Thread>();

  for (const row of rows) {
    const thread = threads.get(row.phone) ?? {
      phone: row.phone,
      who: row.who,
      messages: [],
      unread: 0,
      lastAt: row.createdAt,
    };
    thread.messages.push(row);
    thread.who = thread.who ?? row.who;
    if (row.direction === "INBOUND" && row.readAt === null) thread.unread += 1;
    if (row.createdAt > thread.lastAt) thread.lastAt = row.createdAt;
    threads.set(row.phone, thread);
  }

  for (const thread of threads.values()) {
    thread.messages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  return [...threads.values()].sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
}

/**
 * Whether a reply is somebody asking to be left alone.
 *
 * Recognised and acted on rather than read as an ordinary message: STOP is a
 * legal instruction in most places this runs, and a church that needs a
 * volunteer to notice it in an inbox will eventually not notice it.
 */
const OPT_OUT = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);

export function isOptOut(body: string): boolean {
  return OPT_OUT.has(body.trim().toUpperCase().replace(/[.!]$/, ""));
}

/** And the other way, which the same rules require to be honoured. */
export function isOptIn(body: string): boolean {
  return ["START", "YES", "UNSTOP"].includes(body.trim().toUpperCase().replace(/[.!]$/, ""));
}
