import { canLead, type GroupViewer, type MemberRow, type Standing } from "@/lib/groups";
import { cleanMessage, type CleanMessage } from "@/lib/live-chat";

/**
 * The thread inside a small group — the rules, with no database near them.
 *
 * A group thread is not a comment box. It is the place where somebody says
 * they're in hospital, or that they can't make Tuesday because of the thing
 * they told the group about in confidence six months ago. So it inherits the
 * address rule from `groups.ts` and tightens it:
 *
 *   1. **Only active members read or write.** Not people who have asked, not
 *      people on the waiting list, not people a leader turned down. As private
 *      as the address, for the same reason — and "requested" is explicitly not
 *      enough, because a request is something nobody has answered yet.
 *   2. **Leaving stops the reading.** Checked on every read rather than at the
 *      door, so somebody removed on Monday cannot keep polling on Tuesday.
 *   3. **Hidden is hidden everywhere.** A leader taking a message down is a
 *      pastoral act; it must not come back because a tab was behind.
 *
 * A leader who is not an active member — which happens if somebody is stood
 * down but keeps the role row — does not get in either. Being in the group is
 * the gate, and leading is what you may do once you are through it.
 */

/** The longest a message may be. Four times the live-stream chat: this is
 * where somebody writes a paragraph about their week, not a cheer. */
export const MAX_LENGTH = 2000;

/** How many messages one person may post in the window, and how long it is. */
export const POST_LIMIT = 15;
export const POST_WINDOW_SECONDS = 60;

export type GroupMessageRow = {
  id: string;
  userId: string;
  authorName: string;
  body: string;
  hidden: boolean;
  createdAt: Date;
};

/**
 * Whether this viewer is in the group for the purposes of the thread.
 *
 * Site managers are *not* let in by this. That is deliberate and it is the one
 * place this file departs from `canSeeAddress`: an address is an operational
 * fact somebody running the site may need, whereas the thread is a
 * conversation, and being able to administer a website is not a reason to read
 * one. A manager who needs to see a group's thread can be put in the group,
 * which leaves a row saying so.
 */
export function inTheThread(standing: Standing): boolean {
  return standing === "member" || standing === "leader";
}

/** Whether this viewer may take somebody else's message down. */
export function canModerate(standing: Standing, viewer: GroupViewer): boolean {
  // Leaders of this group only — and they must be in it, per `inTheThread`.
  return inTheThread(standing) && canLead(standing, viewer);
}

export type ThreadState = "open" | "not-a-member" | "signed-out";

export function threadState(standing: Standing, viewer: GroupViewer): ThreadState {
  if (viewer.userId === null) return "signed-out";
  return inTheThread(standing) ? "open" : "not-a-member";
}

export function threadMessage(state: ThreadState): string {
  switch (state) {
    case "open":
      return "";
    case "not-a-member":
      return "The group's conversation is for people in the group.";
    case "signed-out":
      return "Sign in to read your group's conversation.";
  }
}

/** A message as somebody in the thread sees it. */
export type VisibleGroupMessage = {
  id: string;
  by: string;
  body: string;
  at: string;
  /** Whether this reader wrote it — for "you", not for permission. */
  mine: boolean;
  /** Whether this reader may take it down: theirs, or they lead the group. */
  canRemove: boolean;
};

/**
 * The messages this viewer may see, and nothing else.
 *
 * Returns an empty array for anybody not in the group rather than throwing,
 * because the caller's next move is the same either way — show the thread
 * with nothing in it — and a page that forgets to check the standing then
 * prints no messages instead of all of them.
 *
 * Hidden ones are dropped here as well as in the query, on purpose: the poll
 * asks for everything after an id, and a message hidden between two polls
 * would otherwise arrive in the second one.
 */
export function visibleThread(
  rows: readonly GroupMessageRow[],
  standing: Standing,
  viewer: GroupViewer,
): VisibleGroupMessage[] {
  if (!inTheThread(standing) || viewer.userId === null) return [];
  const moderates = canModerate(standing, viewer);
  return rows
    .filter((row) => !row.hidden)
    .map((row) => ({
      id: row.id,
      by: row.authorName,
      body: row.body,
      at: row.createdAt.toISOString(),
      mine: row.userId === viewer.userId,
      canRemove: moderates || row.userId === viewer.userId,
    }));
}

/**
 * Whether this viewer may take one particular message down.
 *
 * Split from `canModerate` because the two answers differ for an author: a
 * member may remove their own and only their own, which is not moderation.
 */
export function canRemoveMessage(
  row: Pick<GroupMessageRow, "userId">,
  standing: Standing,
  viewer: GroupViewer,
): boolean {
  if (!inTheThread(standing) || viewer.userId === null) return false;
  return canModerate(standing, viewer) || row.userId === viewer.userId;
}

/** A message that has been through the rules, ready to store. */
export type CleanGroupMessage = CleanMessage;

/**
 * Tidies and checks what somebody typed.
 *
 * Reuses the live chat's normaliser rather than restating it — the thing being
 * prevented is the same (a wall of blank lines that a length limit alone
 * doesn't stop) and one copy means one place to fix it.
 */
export function cleanGroupMessage(raw: string): CleanGroupMessage {
  return cleanMessage(raw, MAX_LENGTH);
}

/**
 * Who gets told about a new message.
 *
 * Active members who haven't muted the thread, minus the author — nobody
 * wants an email about their own message. Muting keeps somebody in the group
 * and stops the notifications, which is the thing people actually want when a
 * thread gets busy; the alternative they'd otherwise reach for is leaving.
 *
 * Takes rows rather than ids so the caller cannot pass a stale membership list
 * that has been filtered by the wrong status somewhere upstream.
 */
export function notifiable(
  members: readonly (MemberRow & { muted: boolean })[],
  authorId: string,
): string[] {
  return members
    .filter((member) => member.status === "ACTIVE" && !member.muted && member.userId !== authorId)
    .map((member) => member.userId);
}

/**
 * The newest messages, oldest first, capped.
 *
 * The thread is read from the bottom, so the *last* `take` are what matters;
 * sorting newest-first, slicing, then reversing is how you get the most recent
 * page in reading order. Doing it here means a caller who hands over a whole
 * history still renders the right end of it.
 */
export function latest<T extends { createdAt: Date; id: string }>(
  rows: readonly T[],
  take = 50,
): T[] {
  return [...rows]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
    .slice(0, Math.max(0, take))
    .reverse();
}
