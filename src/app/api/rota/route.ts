import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/current-user";
import { askForCover, takeCover, withdrawCover } from "@/lib/cover-query";

/**
 * A member answering a rota, and saying when they are away.
 *
 * Both are the member's own: an assignment can only be answered by the person
 * it was addressed to, and a blockout belongs to whoever wrote it. Staff can
 * see the answers, which is the point, but not give them.
 */
const answer = z.object({
  kind: z.literal("answer"),
  assignmentId: z.string().min(1).max(60),
  status: z.enum(["ACCEPTED", "DECLINED"]),
  /** Why not, in their words — a "no" without one just moves the conversation to text message. */
  note: z.string().max(300).optional(),
});

/**
 * Asking somebody else to take a slot, and taking one.
 *
 * On this route rather than an admin one because both are the member's own
 * act: handing on what you were asked to do, and offering to do what somebody
 * else was asked. Whoever keeps the rota sees the result; they don't perform it.
 */
const cover = z.object({
  kind: z.literal("cover"),
  assignmentId: z.string().min(1).max(60),
  /** False withdraws a request — they sorted it out, or they can make it after all. */
  wanted: z.boolean().default(true),
  note: z.string().max(300).optional(),
});

const take = z.object({
  kind: z.literal("take"),
  assignmentId: z.string().min(1).max(60),
  /** Sent only after the taker has been told they marked themselves away. */
  confirmAway: z.boolean().default(false),
});

const blockout = z.object({
  kind: z.literal("blockout"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(200).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Log in first" }, { status: 401 });

    const body = z.union([answer, cover, take, blockout]).parse(await request.json());

    if (body.kind === "answer") {
      // Scoped to this member in the update itself rather than checked first:
      // a wrong id then changes nothing instead of racing a check.
      const { count } = await prisma.serviceAssignment.updateMany({
        where: { id: body.assignmentId, userId: user.id },
        data: {
          status: body.status,
          note: body.note?.trim() || null,
          respondedAt: new Date(),
        },
      });
      if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true, status: body.status });
    }

    if (body.kind === "cover") {
      if (!body.wanted) {
        await withdrawCover(body.assignmentId, user.id);
        return NextResponse.json({ ok: true, coverWanted: false });
      }
      const assignment = await askForCover(body.assignmentId, user.id, body.note ?? null);
      return NextResponse.json({ ok: true, coverWanted: assignment.coverWanted });
    }

    if (body.kind === "take") {
      const assignment = await takeCover(body.assignmentId, user.id, body.confirmAway);
      return NextResponse.json({ ok: true, planTitle: assignment.plan.title });
    }

    const start = new Date(`${body.startDate}T00:00:00.000Z`);
    const end = new Date(`${body.endDate}T00:00:00.000Z`);
    if (end < start) {
      return NextResponse.json({ error: "That range ends before it starts." }, { status: 400 });
    }

    const created = await prisma.serviceBlockout.create({
      data: { userId: user.id, startDate: start, endDate: end, reason: body.reason?.trim() || null },
    });
    return NextResponse.json({ blockout: created });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Log in first" }, { status: 401 });
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Which one?" }, { status: 400 });

    const { count } = await prisma.serviceBlockout.deleteMany({ where: { id, userId: user.id } });
    if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
