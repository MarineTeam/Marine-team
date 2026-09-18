import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { isPluginEnabled } from "@/lib/plugins";
import { book, cancelBooking, requireDiaryAccess } from "@/lib/resources-query";

/**
 * Holding a room for a span of time.
 *
 * A clash is a 409 carrying what it clashed with — "the hall is booked" is not
 * a useful message, and "the hall is booked for Messy Church, 10:00–12:00" is.
 */
export const dynamic = "force-dynamic";

const schema = z.object({
  resourceId: z.string().min(1).max(60),
  title: z.string().trim().min(1).max(200),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  eventId: z.string().min(1).max(60).nullish(),
  expected: z.number().int().min(0).max(100000).nullish(),
  bookingId: z.string().min(1).max(60).optional(),
});

export async function POST(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("resources"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const user = await requireDiaryAccess();
    const body = schema.parse(await request.json());

    const result = await book(
      {
        resourceId: body.resourceId,
        title: body.title,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        eventId: body.eventId ?? null,
        expected: body.expected ?? null,
        byEmail: user.email,
      },
      body.bookingId,
    );
    await logAudit(user.email, body.bookingId ? "update" : "create", "booking", result.booking.id, body.title);
    return NextResponse.json(result, { status: body.bookingId ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("resources"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const user = await requireDiaryAccess();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Which booking?" }, { status: 400 });
    await cancelBooking(id);
    await logAudit(user.email, "delete", "booking", id, null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
