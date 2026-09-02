import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { notifyPromoted, updateEvent } from "@/lib/events";
import { removeOccurrence } from "@/lib/event-series-query";
import { ensureCapability, ensureStaff } from "@/lib/permissions";
import { slugify } from "@/lib/slug";

const dateish = z.string().min(1).nullish();

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  slug: z.string().trim().max(80).optional(),
  description: z.string().max(5000).nullish(),
  location: z.string().max(300).nullish(),
  startsAt: z.string().min(1).optional(),
  endsAt: dateish,
  allDay: z.boolean().optional(),
  published: z.boolean().optional(),
  memberOnly: z.boolean().optional(),
  registration: z.boolean().optional(),
  capacity: z.number().int().min(0).max(100000).nullish(),
  waitlist: z.boolean().optional(),
  opensAt: dateish,
  closesAt: dateish,
  maxGuests: z.number().int().min(0).max(50).optional(),
});

const when = (value: string | null | undefined) =>
  value === undefined ? undefined : value === null ? null : new Date(value);

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const { id } = await context.params;
    const body = patchSchema.parse(await request.json());

    // Raising the capacity is one of the two ways a place appears, so this
    // goes through updateEvent — which takes the event's lock and moves the
    // waiting list in the same breath.
    const { event, promoted } = await updateEvent(id, {
      ...body,
      slug: body.slug ? slugify(body.slug) || undefined : undefined,
      startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
      endsAt: when(body.endsAt),
      opensAt: when(body.opensAt),
      closesAt: when(body.closesAt),
    });
    await notifyPromoted(promoted);
    await logAudit(user.email, "update", "event", event.id, event.title);
    return NextResponse.json({ event, promoted: promoted.length });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const { id } = await context.params;
    const event = await prisma.event.findUnique({ where: { id }, select: { id: true, title: true } });
    if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Through removeOccurrence rather than a plain delete: when this date
    // belongs to a repeating event, the deletion has to be recorded on the
    // series as well, or tonight's generator sees the gap in the rule and puts
    // the cancelled meeting straight back.
    await removeOccurrence(id);
    await logAudit(user.email, "delete", "event", event.id, event.title);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
