import { cache } from "react";
import { prisma } from "@/lib/db";

/** How many notifications the profile inbox shows at once. */
export const INBOX_PAGE_SIZE = 50;

/**
 * Keeps a copy of a notification in each recipient's inbox.
 *
 * Called from notifySubscribers alongside the actual push/email send, so the
 * inbox is the one place a member can catch up regardless of channel: it
 * still fills up for someone who never allowed push, whose DAILY digest
 * hasn't gone out yet, or who dismissed the notification on another device.
 *
 * With no `userIds`, the notification went to the whole site, so every
 * authorized member gets a copy — unauthorized rows (login attempts awaiting
 * approval, see getCurrentUser) are skipped since they can't reach a profile
 * page to read it.
 */
export async function recordNotifications(
  payload: { title: string; body: string; url?: string },
  userIds?: string[],
): Promise<void> {
  const recipients =
    userIds ??
    (await prisma.user.findMany({ where: { authorized: true }, select: { id: true } })).map((u) => u.id);
  if (recipients.length === 0) return;

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      title: payload.title,
      body: payload.body,
      url: payload.url ?? null,
    })),
  });
}

export async function getNotifications(userId: string, limit = INBOX_PAGE_SIZE) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * The unread badge's number. Wrapped in React's `cache()` like
 * getCurrentUser, because three server components on a single page want it —
 * the navbar, the bottom nav, and the profile layout — and they'd otherwise
 * each run their own COUNT.
 */
export const getUnreadNotificationCount = cache(async (userId: string): Promise<number> => {
  return prisma.notification.count({ where: { userId, readAt: null } });
});

/** Marks the given notifications read, or the member's whole inbox when `ids` is omitted. */
export async function markNotificationsRead(userId: string, ids?: string[]): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
}

export async function deleteNotification(userId: string, id: string): Promise<void> {
  // Scoped by userId as well as id so one member can't delete another's row.
  await prisma.notification.deleteMany({ where: { id, userId } });
}

export async function clearNotifications(userId: string): Promise<void> {
  await prisma.notification.deleteMany({ where: { userId } });
}
