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

/**
 * Sends a web push notification to every subscribed user, or only to the
 * given `userIds` when provided (e.g. subscribers of a specific series).
 * Silently does nothing if VAPID keys aren't configured, so notifications
 * are fully optional. Prunes subscriptions the push service reports as gone
 * (410/404).
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
