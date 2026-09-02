import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { toIsoDate } from "@/lib/dates";
import { describeSeries, shapeOf } from "@/lib/event-series";
import { createSeries } from "@/lib/event-series-query";
import { ensureCapability, ensureStaff } from "@/lib/permissions";

/** Repeating events, for whoever keeps the diary. Same gate as the events themselves. */
export const dynamic = "force-dynamic";

const seriesSchema = z.object({
  title: z.string().trim().min(1).max(200),
  rule: z.string().trim().min(1).max(200),
  timeZone: z.string().trim().min(1).max(64),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Give a date as YYYY-MM-DD"),
  startTime: z.string().regex(/^\d{1,2}:\d{2}$/, "Give a time as HH:MM").nullable().default(null),
  durationMinutes: z.number().int().min(1).max(60 * 24 * 30).nullable().default(null),
  allDay: z.boolean().default(false),
  description: z.string().max(5000).nullish(),
  location: z.string().max(300).nullish(),
  published: z.boolean().default(false),
  memberOnly: z.boolean().default(false),
  registration: z.boolean().default(false),
  capacity: z.number().int().min(0).max(100000).nullable().default(null),
  waitlist: z.boolean().default(true),
  maxGuests: z.number().int().min(0).max(50).default(0),
  opensDaysBefore: z.number().int().min(0).max(730).nullable().default(null),
  closesDaysBefore: z.number().int().min(0).max(730).nullable().default(null),
});

export async function GET() {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const series = await prisma.eventSeries.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { events: true } } },
    });
    return NextResponse.json({
      series: series.map((row) => ({
        id: row.id,
        title: row.title,
        rule: row.rule,
        timeZone: row.timeZone,
        startDate: toIsoDate(row.startDate),
        startTime: row.startTime,
        allDay: row.allDay,
        published: row.published,
        registration: row.registration,
        capacity: row.capacity,
        occurrences: row._count.events,
        generatedThrough: row.generatedThrough ? toIsoDate(row.generatedThrough) : null,
        describes: describeSeries(shapeOf(row)),
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const body = seriesSchema.parse(await request.json());

    const { series, created } = await createSeries(body);
    await logAudit(user.email, "create", "event-series", series.id, `${series.title} — ${created} dates`);
    return NextResponse.json({ series, created }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
