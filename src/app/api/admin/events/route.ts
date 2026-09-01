import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { nextEventSlug, seatsTaken } from "@/lib/events";
import { ensureCapability, ensureStaff } from "@/lib/permissions";

/**
 * The diary, for whoever keeps it.
 *
 * Gated on `manage_events` rather than on `manage_files`: booking the hall and
 * uploading a sermon are different jobs done by different people in most
 * churches, and a registration list carries names and phone numbers that the
 * media library never does.
 */

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  startsAt: z.string().min(1),
});

export async function GET() {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const events = await prisma.event.findMany({
      orderBy: { startsAt: "desc" },
      include: { registrations: { select: { guests: true, status: true } } },
    });
    return NextResponse.json({
      events: events.map(({ registrations, ...event }) => ({
        ...event,
        taken: seatsTaken(registrations),
        going: registrations.filter((r) => r.status === "GOING").length,
        waiting: registrations.filter((r) => r.status === "WAITLIST").length,
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
    const body = createSchema.parse(await request.json());
    const event = await prisma.event.create({
      data: {
        title: body.title,
        slug: await nextEventSlug(body.title),
        startsAt: new Date(body.startsAt),
      },
    });
    await logAudit(user.email, "create", "event", event.id, event.title);
    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
