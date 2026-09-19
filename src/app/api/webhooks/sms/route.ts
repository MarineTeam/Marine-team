import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { isPluginEnabled } from "@/lib/plugins";
import {
  genericSignatureIsValid,
  readGeneric,
  readTwilio,
  twilioSignatureIsValid,
} from "@/lib/sms-inbox";
import { receive } from "@/lib/sms-inbox-query";

/**
 * A text arriving.
 *
 * Two shapes, because the app already sends through two: Twilio posts a form
 * with its own HMAC-SHA1 signature over the URL and the sorted parameters,
 * and a self-hosted gateway posts JSON with the shared-secret scheme the
 * giving webhook uses. Whichever is configured is the one that must verify —
 * an endpoint that accepts either is an endpoint that accepts the weaker.
 *
 * With neither configured this answers 503 and stores nothing: an inbox that
 * anybody can post into is worse than no inbox.
 *
 * Twilio expects an empty TwiML document back, which is what the 200 carries.
 */
export const dynamic = "force-dynamic";

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

export async function POST(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("sms-inbox"))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const secret = process.env.SMS_WEBHOOK_SECRET;
    if (!authToken && !secret) {
      console.error("Neither TWILIO_AUTH_TOKEN nor SMS_WEBHOOK_SECRET is set; refusing inbound SMS");
      return NextResponse.json({ error: "Text replies are not configured." }, { status: 503 });
    }

    // Raw, because both signature schemes are over exactly these bytes.
    const body = await request.text();
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
      if (!authToken) return NextResponse.json({ error: "Bad signature" }, { status: 400 });
      const params = new URLSearchParams(body);
      // The URL Twilio signed is the one it was configured with, which behind
      // a proxy is not always what `request.url` reports.
      const url = process.env.SMS_WEBHOOK_PUBLIC_URL || request.url;
      if (!twilioSignatureIsValid({ url, params, header: request.headers.get("x-twilio-signature"), authToken })) {
        return NextResponse.json({ error: "Bad signature" }, { status: 400 });
      }
      const incoming = readTwilio(params);
      if (!incoming) return NextResponse.json({ error: "Bad body" }, { status: 400 });
      await receive(incoming);
      return new NextResponse(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
    }

    if (!secret) return NextResponse.json({ error: "Bad signature" }, { status: 400 });
    if (!genericSignatureIsValid({ body, header: request.headers.get("x-signature"), secret })) {
      return NextResponse.json({ error: "Bad signature" }, { status: 400 });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return NextResponse.json({ error: "Bad body" }, { status: 400 });
    }
    const incoming = readGeneric(payload);
    if (!incoming) return NextResponse.json({ error: "Bad body" }, { status: 400 });

    const outcome = await receive(incoming);
    return NextResponse.json({ ok: true, stored: outcome.stored });
  } catch (error) {
    return errorResponse(error);
  }
}
