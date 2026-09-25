import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import { readingSummary, whoLookedAt } from "@/lib/read-audit-query";

/**
 * Who has been reading what.
 *
 * Behind `view_audit_log`, like the write trail — but its own endpoint and its
 * own table, because "who read this" and "who changed this" get asked by
 * different people for different reasons, and folding them together buries the
 * rarer of the two.
 *
 * Two questions, and they are the only two worth asking. `?subject=<id>` is the
 * one a complaint starts with: who has been through this record. Without it, the
 * summary is the other one: what has each member of staff been reading. There is
 * deliberately no flat feed of every look — a wall of entries hides the single
 * pattern worth noticing, which is somebody going through records their job does
 * not touch.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !(await hasCapability(user, "view_audit_log"))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const subject = request.nextUrl.searchParams.get("subject");
    if (subject) {
      return NextResponse.json(
        { subject, looks: await whoLookedAt(subject) },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const days = Number(request.nextUrl.searchParams.get("days") ?? 30);
    return NextResponse.json(await readingSummary(Number.isFinite(days) ? Math.min(Math.max(days, 1), 365) : 30), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
