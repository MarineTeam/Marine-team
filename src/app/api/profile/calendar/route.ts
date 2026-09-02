import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { clearCalendarToken, ensureCalendarToken, resetCalendarToken } from "@/lib/calendar-feed-query";
import { getCurrentUser } from "@/lib/current-user";
import { siteUrl } from "@/lib/seo";

/**
 * The member's own calendar-feed link: make one, replace it, or stop it.
 *
 * Deliberately three separate acts rather than one toggle. "Replace" is the
 * answer to a link that got out, and it has to be distinguishable from "stop",
 * because the first keeps the subscription working for the person who resets
 * it and the second is meant to break it for everyone.
 */
export const dynamic = "force-dynamic";

const bodySchema = z.object({ reset: z.boolean().default(false) });

function feedUrl(token: string): string {
  return siteUrl(`/api/calendar/${token}/marine-team.ics`);
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { reset } = bodySchema.parse(await request.json().catch(() => ({})));
    const token = reset ? await resetCalendarToken(user.id) : await ensureCalendarToken(user.id);
    if (reset) await logAudit(user.email, "reset", "calendar-feed", user.id, null);

    return NextResponse.json({ url: feedUrl(token) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await clearCalendarToken(user.id);
    await logAudit(user.email, "stop", "calendar-feed", user.id, null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
