import { ApiError } from "@/lib/api-guard";
import { prisma } from "@/lib/db";
import { getDisplayName } from "@/lib/profile";
import { notifySubscribers } from "@/lib/push";
import {
  canRemoveMessage,
  cleanGroupMessage,
  inTheThread,
  notifiable,
  type GroupMessageRow,
} from "@/lib/group-messages";
import { standingIn, type GroupViewer } from "@/lib/groups";
import type { GroupMemberStatus, GroupRole, User } from "@prisma/client";

/**
 * Reading and writing a group's thread.
 *
 * The rules are in `group-messages.ts`. What this file is careful about is
 * that **standing is re-read on every call**, never carried from a previous
 * one. Somebody removed from a group on Monday has a browser tab that will
 * happily keep polling on Tuesday, and the only thing standing between that
 * tab and the conversation is this lookup running again.
 *
 * Polling rather than sockets, for the same deployment reason as the live
 * chat: no long-lived process. `?since=<id>` is one indexed range scan.
 */

/** How many messages one answer may carry. */
export const MAX_PAGE = 100;

const memberShape = { userId: true, role: true, status: true, muted: true } as const;

/** A member row as the thread needs it — membership plus the mute flag. */
export type ThreadMember = {
  userId: string;
  role: GroupRole;
  status: GroupMemberStatus;
  muted: boolean;
};

/** A group with enough of its membership to decide anything about the thread. */
export type ThreadGroup = {
  id: string;
  slug: string;
  name: string;
  members: ThreadMember[];
};

/**
 * The group and its membership, or null.
 *
 * Everything the thread needs to decide anything comes back in one query —
 * the alternative, checking membership separately from loading the messages,
 * is what leaves a window between the two.
 */
export async function threadGroup(slug: string) {
  return prisma.smallGroup.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, members: { select: memberShape } },
  });
}

/**
 * Messages for a group, oldest first.
 *
 * Hidden rows are dropped in the query as well as in `visibleThread`. Both,
 * not either: the query keeps them off the wire, and the pure filter keeps a
 * message hidden between two polls from arriving in the second one.
 *
 * `since` is an id rather than a timestamp because ids are what the client
 * already has, and the index is on (groupId, id). Prisma's `cuid()` carries a
 * time prefix, so ascending id is ascending time; the property polling needs
 * is that every message is delivered exactly once, which a monotonic cursor
 * gives whatever the sub-millisecond order turns out to be.
 */
export async function messagesSince(
  groupId: string,
  since: string | null,
  take = MAX_PAGE,
): Promise<GroupMessageRow[]> {
  return prisma.groupMessage.findMany({
    where: { groupId, hidden: false, ...(since ? { id: { gt: since } } : {}) },
    orderBy: { id: "asc" },
    // A tab left open all week asks with an id from Monday; the cap is what
    // stops that one answer being the whole week.
    take: Math.min(Math.max(1, take), MAX_PAGE),
    select: { id: true, userId: true, authorName: true, body: true, hidden: true, createdAt: true },
  });
}

/** The last page of a thread, for a first load. */
export async function recentMessages(groupId: string, take = MAX_PAGE): Promise<GroupMessageRow[]> {
  const rows = await prisma.groupMessage.findMany({
    where: { groupId, hidden: false },
    orderBy: { id: "desc" },
    take: Math.min(Math.max(1, take), MAX_PAGE),
    select: { id: true, userId: true, authorName: true, body: true, hidden: true, createdAt: true },
  });
  return rows.reverse();
}

/**
 * Writes a message, having checked the writer is still in the group.
 *
 * The membership check is here rather than only in the route because this is
 * the function that produces a row; a second caller added later gets the check
 * for free rather than having to remember it.
 */
export async function postMessage(
  group: ThreadGroup,
  user: User,
  raw: string,
): Promise<{ id: string }> {
  const viewer: GroupViewer = { userId: user.id, manages: false };
  if (!inTheThread(standingIn(group.members, viewer))) {
    // 404, not 403: whether a group has a conversation going is not something
    // somebody outside it needs confirmed.
    throw new ApiError(404, "not_found", "Not found");
  }

  const cleaned = cleanGroupMessage(raw);
  if (!cleaned.ok) throw new ApiError(400, "bad_message", cleaned.reason);

  const message = await prisma.groupMessage.create({
    data: {
      groupId: group.id,
      userId: user.id,
      // Copied at write time, like the live chat: a later change of display
      // name shouldn't rewrite what a conversation looked like.
      authorName: getDisplayName(user),
      body: cleaned.body,
    },
    select: { id: true },
  });

  await notifyThread(group, user, cleaned.body);
  return message;
}

/**
 * Tells the rest of the group, and swallows its own failures.
 *
 * A push service being down must not lose somebody's message — the message is
 * already written by the time this runs, and the thread is the record. The
 * notification is a courtesy on top of it.
 */
async function notifyThread(
  group: Pick<ThreadGroup, "slug" | "name" | "members">,
  author: User,
  body: string,
): Promise<void> {
  const told = notifiable(group.members, author.id);
  if (told.length === 0) return;
  const name = getDisplayName(author);
  try {
    await notifySubscribers(
      {
        title: `${name} posted in ${group.name}`,
        // The first line only. A notification is a nudge to go and read the
        // thread, and a group thread is exactly the place where the whole of
        // a message shouldn't be sitting on a lock screen.
        body: body.length > 140 ? `${body.slice(0, 139)}…` : body,
        url: `/groups/${group.slug}#thread`,
      },
      told,
    );
  } catch {
    // Deliberately ignored — see the doc comment.
  }
}

/**
 * Takes a message down.
 *
 * Hidden, not deleted: the same message can't then be reposted past a leader
 * who has already decided about it, and the decision survives for anybody
 * asked about it later. Who may do it is `canRemoveMessage` — the author, or a
 * leader of this group.
 */
export async function removeMessage(
  group: Pick<ThreadGroup, "id" | "members">,
  messageId: string,
  viewer: GroupViewer,
): Promise<void> {
  const row = await prisma.groupMessage.findUnique({
    where: { id: messageId },
    select: { id: true, userId: true, groupId: true },
  });
  // The group check matters: an id from another group's thread must not be
  // removable by somebody who happens to lead this one.
  if (!row || row.groupId !== group.id) throw new ApiError(404, "not_found", "That message is gone.");

  if (!canRemoveMessage(row, standingIn(group.members, viewer), viewer)) {
    throw new ApiError(404, "not_found", "That message is gone.");
  }

  await prisma.groupMessage.update({ where: { id: messageId }, data: { hidden: true } });
}

/**
 * Mutes or unmutes the thread for one member.
 *
 * Scoped by (group, user) in the where clause rather than by a row id, so a
 * wrong id changes nothing instead of somebody else's setting. Only somebody
 * already in the group can mute it, which `updateMany` gives for free: a
 * non-member matches no rows.
 */
export async function setMuted(groupId: string, userId: string, muted: boolean): Promise<boolean> {
  const { count } = await prisma.smallGroupMember.updateMany({
    where: { groupId, userId, status: "ACTIVE" },
    data: { muted },
  });
  return count > 0;
}

/** Whether this member has muted the thread. */
export function isMuted(
  members: readonly { userId: string; muted: boolean }[],
  userId: string | null,
): boolean {
  if (userId === null) return false;
  return members.find((member) => member.userId === userId)?.muted ?? false;
}
