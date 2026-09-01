import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { ensureCapability, ensureStaff } from "@/lib/permissions";
import { notifySubscribers } from "@/lib/push";

const patchSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "ANSWERED", "HIDDEN"]).optional(),
  answeredNote: z.string().trim().max(1000).nullish(),
  visibility: z.enum(["EVERYONE", "MEMBERS", "LEADERS"]).optional(),
});

/** Letting one through, taking it down, or marking it answered. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "moderate_prayer");
    const { id } = await context.params;
    const body = patchSchema.parse(await request.json());

    const before = await prisma.prayerRequest.findUnique({ where: { id } });
    if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await prisma.prayerRequest.update({
      where: { id },
      data: {
        ...body,
        answeredAt: body.status === "ANSWERED" ? (before.answeredAt ?? new Date()) : undefined,
        moderatedBy: user.email,
        moderatedAt: new Date(),
      },
    });

    // Telling somebody their request is up is worth an interruption; telling
    // them it was taken down is a conversation, not a notification.
    if (before.status === "PENDING" && updated.status === "APPROVED" && updated.userId) {
      await notifySubscribers(
        {
          title: "Your prayer request is on the wall",
          body: "People can pray for it now.",
          url: "/prayer",
        },
        [updated.userId],
      );
    }

    // The body is never written to the audit log: that log is read by more
    // people than the wall is.
    await logAudit(user.email, "update", "prayer-request", updated.id, updated.status);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "moderate_prayer");
    const { id } = await context.params;
    await prisma.prayerRequest.delete({ where: { id } });
    await logAudit(user.email, "delete", "prayer-request", id, null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
