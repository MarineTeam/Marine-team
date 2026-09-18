import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { isPluginEnabled } from "@/lib/plugins";
import { listSessions, openSession, requireDesk } from "@/lib/checkin-query";

/**
 * The rooms open today.
 *
 * Gated on `run_checkin` — the narrowest capability in the app. Somebody
 * working the desk on a Sunday is given this and nothing else: it does not
 * open the household list, and nothing else implies it.
 */
export const dynamic = "force-dynamic";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Give a date as YYYY-MM-DD");

const openSchema = z.object({
  name: z.string().trim().min(1).max(120),
  date: isoDate,
  room: z.string().trim().max(120).nullish(),
  minAge: z.number().int().min(0).max(30).nullish(),
  maxAge: z.number().int().min(0).max(30).nullish(),
});

export async function GET(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("checkin"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await requireDesk();
    const date = new URL(request.url).searchParams.get("date");
    const sessions = await listSessions(date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? (date as never) : undefined);
    return NextResponse.json({ sessions }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("checkin"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await requireDesk();
    const body = openSchema.parse(await request.json());
    return NextResponse.json(
      await openSession({ ...body, date: body.date as never }),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
