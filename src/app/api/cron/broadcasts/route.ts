import { NextRequest, NextResponse } from "next/server";
import { sendNextBatch, unfinishedBroadcasts } from "@/lib/broadcast-send";
import { purgeExpiredPairings } from "@/lib/tv-session";

/**
 * Finishes anything left half-sent.
 *
 * A broadcast is normally driven to completion by the admin screen's own loop.
 * This is the safety net for the run that stopped because somebody closed the
 * tab, lost their connection, or shut the laptop — a half-delivered "no
 * service tomorrow" is worse than none, because the people who got it assume
 * everyone did.
 *
 * Once a day, which is what the hosting plan allows (see vercel.json). It is
 * a backstop, not the delivery mechanism.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUDGET_MS = 50_000;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 401 });
  }

  const started = Date.now();
  const finished: { id: string; sent: number; failed: number; remaining: number }[] = [];

  for (const id of await unfinishedBroadcasts()) {
    if (Date.now() - started > BUDGET_MS) break;
    let progress = await sendNextBatch(id, { budgetMs: BUDGET_MS - (Date.now() - started) });
    const totals = { sent: progress.sent, failed: progress.failed };
    while (!progress.finished && Date.now() - started < BUDGET_MS) {
      progress = await sendNextBatch(id, { budgetMs: BUDGET_MS - (Date.now() - started) });
      totals.sent += progress.sent;
      totals.failed += progress.failed;
    }
    finished.push({ id, ...totals, remaining: progress.remaining });
  }

  // Piggy-backed on this sweep rather than given a cron of its own: the
  // hosting plan allows one job a day, and clearing out pairings nobody
  // completed is a single indexed delete.
  const pairingsPurged = await purgeExpiredPairings();

  return NextResponse.json({ ranAt: new Date().toISOString(), broadcasts: finished, pairingsPurged });
}
