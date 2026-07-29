import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendDigestToUser } from "@/lib/push";

/**
 * Runs once a day (see the "crons" entry in vercel.json), batching every
 * PendingNotification a DAILY-frequency user has accumulated into one push,
 * then clearing them. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`
 * automatically when that env var is set; reject anything else so this
 * can't be hit to mass-send pushes from outside.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 401 });
  }

  const pending = await prisma.pendingNotification.findMany({ orderBy: { createdAt: "asc" } });
  const byUser = new Map<string, typeof pending>();
  for (const item of pending) {
    const forUser = byUser.get(item.userId) ?? [];
    forUser.push(item);
    byUser.set(item.userId, forUser);
  }

  for (const [userId, items] of byUser) {
    const single = items.length === 1 ? items[0] : null;
    await sendDigestToUser(userId, {
      title: single ? single.title : `${items.length} new updates`,
      body: single ? single.body : items.map((i) => i.title).join(", "),
      url: single?.url ?? undefined,
    });
  }

  await prisma.pendingNotification.deleteMany({ where: { id: { in: pending.map((p) => p.id) } } });
  return NextResponse.json({ usersNotified: byUser.size, itemsCleared: pending.length });
}
