import { SmsError } from "@/lib/sms";

/**
 * Sending one text message.
 *
 * Two providers behind one interface, the same shape as `ScheduleProvider`:
 * Twilio, because it is what most people already have, and a generic JSON
 * webhook for everything else — a gateway of their own, a national provider
 * with a different API, an office phone system. Adding a third means
 * implementing `sendSms` and nothing else.
 *
 * Unconfigured is a first-class state, like transcription's: `smsConfig()`
 * returns null, the admin screen says which environment variables are missing,
 * and the SMS channel is offered but refused rather than silently doing
 * nothing.
 *
 * Server-only. The pure half — what a number looks like, what a message costs
 * — is in `sms.ts`, which the composer imports into the browser.
 */

export type SmsConfig =
  | { kind: "twilio"; accountSid: string; authToken: string; from: string }
  | { kind: "webhook"; url: string; token: string | null; from: string | null };

/**
 * What the deployment has configured, or null.
 *
 * Twilio wins when both are set, because somebody who has filled in a Twilio
 * SID has said something more specific than somebody who has a URL.
 */
export function smsConfig(): SmsConfig | null {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_FROM;
  if (sid && token && twilioFrom) {
    return { kind: "twilio", accountSid: sid, authToken: token, from: twilioFrom };
  }

  const url = process.env.SMS_WEBHOOK_URL;
  if (url) {
    return {
      kind: "webhook",
      url,
      token: process.env.SMS_WEBHOOK_TOKEN ?? null,
      from: process.env.SMS_FROM ?? null,
    };
  }

  return null;
}

/** What to tell an admin looking at a switched-off SMS channel. */
export function smsUnavailableReason(): string {
  return (
    "Texting isn't set up. Either set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and " +
    "TWILIO_FROM, or point SMS_WEBHOOK_URL at your own gateway."
  );
}

export async function sendSms(config: SmsConfig, to: string, body: string): Promise<void> {
  if (config.kind === "twilio") {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: config.from, Body: body }),
      },
    );
    if (!response.ok) {
      // Twilio's own message names the problem ("is not a valid phone
      // number"), which is what an organiser needs to see beside the name.
      const detail = await response.text().catch(() => "");
      throw new SmsError(twilioMessage(detail) ?? `The texting service refused it (${response.status}).`);
    }
    return;
  }

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
    },
    body: JSON.stringify({ to, from: config.from, body }),
  });
  if (!response.ok) {
    throw new SmsError(`The texting service refused it (${response.status}).`);
  }
}

/** Twilio answers with JSON carrying a human-readable `message`. */
function twilioMessage(payload: string): string | null {
  try {
    const parsed = JSON.parse(payload);
    return typeof parsed?.message === "string" ? parsed.message : null;
  } catch {
    return null;
  }
}
