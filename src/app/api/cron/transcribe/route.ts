import { NextRequest, NextResponse } from "next/server";
import { transcribeQueued } from "@/lib/transcribe-worker";

/**
 * Works through the transcription queue once a day.
 *
 * A queue and a schedule rather than doing it when the admin presses the
 * button, because transcribing an hour of audio takes minutes — longer than a
 * request is allowed to live on most hosting, and far longer than anybody
 * should watch a spinner. Pressing the button marks the video QUEUED; this
 * picks it up.
 *
 * **Daily, and bounded by time rather than by a count.** Vercel's Hobby plan
 * allows a cron only once a day, and one video per run would then mean one
 * video a day. So a run takes as many as fit inside the function's own limit
 * and leaves the rest queued for tomorrow. On a plan with a longer timeout,
 * raise `maxDuration` and `BUDGET_MS` together; on one that allows a more
 * frequent cron, tighten the schedule in `vercel.json` instead — either gets
 * through a backlog faster.
 *
 * Same CRON_SECRET bearer-token guard as the other scheduled jobs.
 */
export const dynamic = "force-dynamic";

/** Hobby's ceiling. Raise this and BUDGET_MS together on a paid plan. */
export const maxDuration = 60;

/**
 * Stop starting new ones with this much of the run gone.
 *
 * Short of `maxDuration` on purpose: the count of what is left is read after
 * the last video, and a run killed before that write would report nothing.
 */
const BUDGET_MS = 50_000;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 401 });
  }

  return NextResponse.json(await transcribeQueued(BUDGET_MS));
}
