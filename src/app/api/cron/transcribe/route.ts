import { NextRequest, NextResponse } from "next/server";
import { transcribeNextQueued } from "@/lib/transcribe-worker";

/**
 * Transcribes one queued video per run.
 *
 * A queue and a schedule rather than doing it when the admin presses the
 * button, because transcribing an hour of audio takes minutes — longer than a
 * request is allowed to live on most hosting, and far longer than anybody
 * should watch a spinner. Pressing the button marks the video QUEUED; this
 * picks it up.
 *
 * One video per run keeps any single run short, and a backlog drains over
 * successive runs rather than in one request that would be killed halfway.
 * Same CRON_SECRET bearer-token guard as the other scheduled jobs.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 401 });
  }

  const outcome = await transcribeNextQueued();
  return NextResponse.json(outcome);
}
