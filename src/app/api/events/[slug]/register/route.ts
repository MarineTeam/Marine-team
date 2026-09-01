import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { cancelRegistration, notifyPromoted, register } from "@/lib/events";
import { isPluginEnabled } from "@/lib/plugins";
import { notifySubscribers } from "@/lib/push";
import { rateLimitResponse, windowStart } from "@/lib/rate-limit";

/**
 * Signing up, and dropping out.
 *
 * Open to people with no account on purpose: the people a church most wants at
 * a men's breakfast are the ones who have never made one. That makes this an
 * unauthenticated write, so it is rate-limited per event and the event's own
 * `memberOnly` flag is the way to close it.
 */

const registerSchema = z.object({
  name: z.string().trim().min(1, "Please give a name.").max(120),
  email: z.email("That doesn't look like an email address.").max(200),
  phone: z.string().trim().max(40).nullish(),
  guests: z.number().int().min(0).max(50).optional(),
  note: z.string().trim().max(500).nullish(),
});

/** Fifty sign-ups a minute on one event is a script, not a church. */
const MAX_PER_MINUTE = 50;

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    if (!(await isPluginEnabled("events"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { slug } = await context.params;
    const event = await prisma.event.findUnique({ where: { slug }, select: { id: true, title: true, slug: true } });
    if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const limited = await rateLimitResponse(
      () =>
        prisma.eventRegistration.count({
          where: { eventId: event.id, createdAt: { gte: windowStart(60) } },
        }),
      MAX_PER_MINUTE,
    );
    if (limited) return limited;

    const user = await getCurrentUser();
    const body = registerSchema.parse(await request.json());
    const outcome = await register(
      event.id,
      { ...body, phone: body.phone ?? null, note: body.note ?? null },
      user?.id ?? null,
    );

    // Only members can be told anything: an email address typed into a public
    // form is not an address this app has agreed to write to.
    if (user) {
      await notifySubscribers(
        {
          title: outcome.status === "GOING" ? `You're signed up: ${event.title}` : `You're on the waiting list: ${event.title}`,
          body:
            outcome.status === "GOING"
              ? "We'll see you there."
              : "We'll let you know if a place frees up.",
          url: `/events/${event.slug}`,
        },
        [user.id],
      );
    }

    return NextResponse.json(outcome, { status: outcome.updated ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Dropping out, which is also what hands a place to the next person waiting.
 *
 * Members only — there is no way to prove that whoever posts this is the
 * person whose name is on an accountless sign-up, and letting anyone cancel
 * anyone by guessing an email is worse than asking them to phone the office.
 */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const event = await prisma.event.findUnique({ where: { slug }, select: { id: true } });
    if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const mine = await prisma.eventRegistration.findUnique({
      where: { eventId_userId: { eventId: event.id, userId: user.id } },
    });
    if (!mine || mine.status === "CANCELLED") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { promoted } = await cancelRegistration(mine.id, { userId: user.id, isStaff: false });
    await notifyPromoted(promoted);
    return NextResponse.json({ ok: true, promoted: promoted.length });
  } catch (error) {
    return errorResponse(error);
  }
}
