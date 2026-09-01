/**
 * The chat beside a live stream — the parts that don't need a database.
 *
 * Polling rather than sockets, which is a deployment fact rather than a
 * preference: this app runs on serverless functions with no long-lived process
 * to hold a socket open. A page asks "anything after this id?" every few
 * seconds; the answer is one indexed range scan.
 *
 * Three rules keep an open comment box from becoming a liability, and all
 * three are here rather than scattered across the route:
 *
 *   1. **The chat is only open while the stream is.** A comment box left
 *      standing on last Christmas' carol service, unwatched, is exactly where
 *      the thing you don't want written gets written.
 *   2. **Slow mode is per person, not per stream.** Rate limiting the whole
 *      chat would let one fast typist silence everybody else.
 *   3. **Hidden is hidden everywhere**, including in the poll — a message
 *      taken down must not reappear because somebody's tab was behind.
 */

export type ChatWindow = {
  chatEnabled: boolean;
  startAt: Date;
  endAt: Date | null;
};

/** How long before a stream starts the chat opens, and how long after it closes. */
export const OPENS_BEFORE_MS = 30 * 60 * 1000;
export const CLOSES_AFTER_MS = 60 * 60 * 1000;

export type ChatState = "off" | "not-yet" | "open" | "ended";

/**
 * Whether the chat takes messages.
 *
 * Open half an hour before, so people arriving early can say hello, and for an
 * hour after, so the conversation a service starts doesn't get cut off
 * mid-sentence. Then it closes — permanently, with the messages still
 * readable.
 */
export function chatState(stream: ChatWindow, now: Date = new Date()): ChatState {
  if (!stream.chatEnabled) return "off";
  const at = now.getTime();
  if (at < stream.startAt.getTime() - OPENS_BEFORE_MS) return "not-yet";
  const ends = (stream.endAt ?? new Date(stream.startAt.getTime() + 3 * 60 * 60 * 1000)).getTime();
  if (at > ends + CLOSES_AFTER_MS) return "ended";
  return "open";
}

export function chatMessage(state: ChatState): string {
  switch (state) {
    case "off":
      return "";
    case "not-yet":
      return "The chat opens shortly before the stream starts.";
    case "open":
      return "";
    case "ended":
      return "The chat for this stream has closed.";
  }
}

/** A message that has been through the rules, ready to store. */
export type CleanMessage = { ok: true; body: string } | { ok: false; reason: string };

export const MAX_LENGTH = 500;

/**
 * Tidies and checks what somebody typed.
 *
 * Collapses the runs of newlines and spaces that turn one message into a
 * screenful — which is the cheapest form of shouting and the one a length
 * limit alone doesn't stop.
 */
export function cleanMessage(raw: string): CleanMessage {
  const body = raw
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!body) return { ok: false, reason: "Write something first." };
  if (body.length > MAX_LENGTH) {
    return { ok: false, reason: `That's longer than ${MAX_LENGTH} characters.` };
  }
  return { ok: true, body };
}

/**
 * How long this person must wait before writing again.
 *
 * Per person: rate limiting the whole chat would let one fast typist silence
 * everybody else. Zero when they may write now.
 */
export function waitSeconds(
  lastMessageAt: Date | null,
  slowModeSeconds: number,
  now: Date = new Date(),
): number {
  if (slowModeSeconds <= 0 || !lastMessageAt) return 0;
  const elapsed = (now.getTime() - lastMessageAt.getTime()) / 1000;
  return Math.max(0, Math.ceil(slowModeSeconds - elapsed));
}

/** A message as anybody reading the chat sees it. Note there is no user id. */
export type VisibleMessage = {
  id: string;
  by: string;
  body: string;
  at: string;
  /** Whether this reader may take it down: theirs, or they moderate. */
  canRemove: boolean;
};

export type MessageRow = {
  id: string;
  userId: string;
  authorName: string;
  body: string;
  hidden: boolean;
  createdAt: Date;
};

/**
 * The messages to show, and nothing else.
 *
 * Hidden ones are dropped here rather than only in the query, so a poll
 * cannot deliver a message a moderator has just taken down to a tab that was
 * a few seconds behind.
 */
export function visibleMessages(
  rows: readonly MessageRow[],
  viewer: { userId: string | null; moderates: boolean },
): VisibleMessage[] {
  return rows
    .filter((row) => !row.hidden)
    .map((row) => ({
      id: row.id,
      by: row.authorName,
      body: row.body,
      at: row.createdAt.toISOString(),
      canRemove: viewer.moderates || (viewer.userId !== null && row.userId === viewer.userId),
    }));
}
