import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { isPluginEnabled } from "@/lib/plugins";
import { readCheckout, readRefund, webhookIsAuthentic } from "@/lib/giving";
import { markRefunded, recordIncoming } from "@/lib/giving-query";

/**
 * What the payment processor tells us happened.
 *
 * The only unauthenticated write in the giving feature, and the only one that
 * needs to be: nobody is signed in when a webhook arrives. Three things stand
 * in for a session, and all three are needed —
 *
 *   1. the signature, checked against `GIVING_WEBHOOK_SECRET` over the *raw*
 *      body (parsing first and re-serialising changes bytes and breaks it);
 *   2. the timestamp in that signature, which stops a captured delivery being
 *      replayed tomorrow;
 *   3. the unique reference on the gift, which stops it being replayed now —
 *      every processor retries, and a retry that records a second gift tells
 *      somebody they gave twice what they did.
 *
 * With no secret configured this answers 503 and records nothing. An
 * unconfigured deployment must not be an open endpoint for inventing income.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("giving"))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const secret = process.env.GIVING_WEBHOOK_SECRET;
    if (!secret) {
      console.error("GIVING_WEBHOOK_SECRET is not set; refusing giving webhooks");
      return NextResponse.json({ error: "Giving is not configured." }, { status: 503 });
    }

    // Raw, because the signature is over these exact bytes.
    const body = await request.text();
    if (
      !webhookIsAuthentic({ body, header: request.headers.get("stripe-signature"), secret })
    ) {
      return NextResponse.json({ error: "Bad signature" }, { status: 400 });
    }

    let event: unknown;
    try {
      event = JSON.parse(body);
    } catch {
      return NextResponse.json({ error: "Bad body" }, { status: 400 });
    }

    const gift = readCheckout(event);
    if (gift) {
      const outcome = await recordIncoming(gift);
      return NextResponse.json({ ok: true, recorded: outcome.recorded });
    }

    const refunded = readRefund(event);
    if (refunded) {
      return NextResponse.json({ ok: true, refunded: await markRefunded(refunded) });
    }

    // Everything else the processor sends is acknowledged and ignored: an
    // endpoint that 400s on an event it doesn't care about gets disabled.
    return NextResponse.json({ ok: true, ignored: true });
  } catch (error) {
    return errorResponse(error);
  }
}
