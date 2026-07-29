/**
 * Sends a plain notification email via the Resend API (a single fetch POST,
 * matching how bunny.ts and webhooks.ts talk to their own REST APIs rather
 * than pulling in an SDK). Silently does nothing if RESEND_API_KEY or
 * EMAIL_FROM aren't set, so email is fully optional like Web Push's VAPID
 * keys — a church running without either still works.
 */
export async function sendEmail(to: string, subject: string, body: string, url?: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return;

  const escaped = body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const link = url ? `${process.env.APP_BASE_URL ?? ""}${url}` : null;
  const html = `<p>${escaped}</p>${link ? `<p><a href="${link}">${link}</a></p>` : ""}`;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
  } catch {
    // Best-effort, matching notifySubscribers' fire-and-forget push sends.
  }
}
