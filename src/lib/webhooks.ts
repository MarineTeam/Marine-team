import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { isPluginEnabled } from "@/lib/plugins";

/**
 * Best-effort POST of a JSON payload to every active webhook URL, signed
 * with HMAC-SHA256 in an X-Webhook-Signature header when the webhook has a
 * secret. A slow or unreachable endpoint never blocks the publish it fired
 * from — failures are swallowed, matching notifySubscribers' fire-and-forget
 * behavior for Web Push.
 */
export async function fireWebhooks(event: string, payload: Record<string, unknown>): Promise<void> {
  if (!(await isPluginEnabled("webhooks"))) return;

  const webhooks = await prisma.webhook.findMany({ where: { active: true } });
  if (webhooks.length === 0) return;

  const body = JSON.stringify({ event, payload, sentAt: new Date().toISOString() });

  await Promise.all(
    webhooks.map(async (webhook) => {
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (webhook.secret) {
          headers["X-Webhook-Signature"] = crypto.createHmac("sha256", webhook.secret).update(body).digest("hex");
        }
        await fetch(webhook.url, { method: "POST", headers, body });
      } catch {
        // Best-effort: a broken third-party endpoint shouldn't affect publishing.
      }
    }),
  );
}
