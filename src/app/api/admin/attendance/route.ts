import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { isIsoDate } from "@/lib/dates";
import { isPluginEnabled } from "@/lib/plugins";
import {
  attendanceView,
  recordCount,
  removeCount,
  requireCounter,
  requireNumbers,
} from "@/lib/service-attendance-query";

/**
 * Taking a headcount, and reading the chart.
 *
 * Two capabilities, not one. Writing a count is keeping the diary
 * (`manage_events`) — the person who knows which services ran. Reading the
 * numbers is `view_analytics`, which is what the rest of the reporting in this
 * app sits behind. Somebody who takes the count can also see it, because
 * counting blind is how a steward stops bothering.
 */
export const dynamic = "force-dynamic";

const headcount = z.number().int().min(0).max(100000).nullable();

const schema = z.object({
  date: z.string().refine(isIsoDate, "Not a date"),
  gathering: z.string().trim().min(1).max(60),
  adults: headcount,
  children: headcount,
  visitors: headcount,
  note: z.string().trim().max(200).optional(),
});

export async function GET(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("attendance"))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await requireNumbers();
    const weeks = Number(request.nextUrl.searchParams.get("weeks") ?? 26);
    return NextResponse.json(await attendanceView(Number.isFinite(weeks) ? Math.min(Math.max(weeks, 4), 260) : 26));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("attendance"))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const user = await requireCounter();
    const body = schema.parse(await request.json());
    const outcome = await recordCount(body, user.email);
    await logAudit(user.email, "record", "attendance", outcome.count.id, `${body.date} ${body.gathering}`);
    return NextResponse.json(outcome, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("attendance"))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const user = await requireCounter();
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Which count?" }, { status: 400 });
    await removeCount(id);
    await logAudit(user.email, "delete", "attendance", id, "");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
