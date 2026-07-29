import webpush from "web-push";
import { prisma } from "@/lib/db";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    publicKey,
    privateKey,
  );
  configured = true;
}

type PushSubscriptionRow = { id: string; userId: string; endpoint: string; p256dh: string; auth: string };

/** Sends straight to the given subscriptions, bypassing any frequency preference — this itself is the batched send for a digest. Prunes subscriptions the push service reports as gone (410/404). */
async function sendToSubscriptions(
  payload: { title: string; body: string; url?: string },
  subscriptions: PushSubscriptionRow[],
) {
  ensureConfigured();
  if (!configured) return;
  const data = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          data,
        );
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    }),
  );
}

/**
 * Sends a web push notification to every subscribed user, or only to the
 * given `userIds` when provided (e.g. subscribers of a specific series).
 * Silently does nothing if VAPID keys aren't configured, so notifications
 * are fully optional.
 *
 * A user whose `notificationFrequency` is DAILY doesn't get pushed here at
 * all — this queues a `PendingNotification` row for them instead, batched
 * and sent once a day by the cron at /api/cron/notification-digest. Everyone
 * else (the INSTANT default) is unaffected: same immediate send as before.
 */
export async function notifySubscribers(
  payload: { title: string; body: string; url?: string },
  userIds?: string[],
) {
  ensureConfigured();
  if (!configured) return;
  if (userIds && userIds.length === 0) return;

  const subscriptions = await prisma.pushSubscription.findMany(
    userIds ? { where: { userId: { in: userIds } } } : undefined,
  );
  if (subscriptions.length === 0) return;

  const subscriberIds = [...new Set(subscriptions.map((s) => s.userId))];
  const digestUsers = await prisma.user.findMany({
    where: { id: { in: subscriberIds }, notificationFrequency: "DAILY" },
    select: { id: true },
  });
  const digestUserIds = new Set(digestUsers.map((u) => u.id));

  const instantSubscriptions = subscriptions.filter((s) => !digestUserIds.has(s.userId));
  await sendToSubscriptions(payload, instantSubscriptions);

  if (digestUserIds.size > 0) {
    await prisma.pendingNotification.createMany({
      data: [...digestUserIds].map((userId) => ({
        userId,
        title: payload.title,
        body: payload.body,
        url: payload.url ?? null,
      })),
    });
  }
}

/** Used only by the daily digest cron: sends one already-batched message straight to a user's own subscriptions. */
export async function sendDigestToUser(userId: string, payload: { title: string; body: string; url?: string }) {
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  await sendToSubscriptions(payload, subscriptions);
}
