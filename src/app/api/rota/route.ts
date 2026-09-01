import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/current-user";

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

    const body = z.union([answer, blockout]).parse(await request.json());

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
