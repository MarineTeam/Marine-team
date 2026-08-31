import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

/**
 * Editing one service plan.
 *
 * `items` is sent whole rather than as per-item routes: a running order is
 * one thing, edited as one thing, and a plan of six hymns is small enough
 * that replacing the list is simpler to reason about than reconciling it —
 * no half-applied reorder, no orphan when a hymn is dropped and another
 * added in the same breath. Positions come from the array's own order, so
 * the client never sends an index that can disagree with what it drew.
 */
const updateSchema = z.object({
  title: z.string().min(1).optional(),
  serviceDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  published: z.boolean().optional(),
  items: z
    .array(
      z.object({
        fileId: z.string().min(1),
        hymnNumber: z.number().int().min(1).max(9999).nullable().optional(),
        note: z.string().nullable().optional(),
      }),
    )
    .max(50)
    .optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_files");
    const { id } = await params;
    const body = updateSchema.parse(await request.json());

    const existing = await prisma.servicePlan.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const plan = await prisma.$transaction(async (tx) => {
      if (body.items) {
        await tx.servicePlanItem.deleteMany({ where: { planId: id } });
        if (body.items.length > 0) {
          await tx.servicePlanItem.createMany({
            data: body.items.map((item, position) => ({
              planId: id,
              fileId: item.fileId,
              hymnNumber: item.hymnNumber ?? null,
              note: item.note?.trim() || null,
              position,
            })),
          });
        }
      }
      return tx.servicePlan.update({
        where: { id },
        data: {
          title: body.title,
          serviceDate:
            body.serviceDate === undefined
              ? undefined
              : body.serviceDate === null
                ? null
                : new Date(body.serviceDate),
          notes: body.notes === undefined ? undefined : body.notes?.trim() || null,
          published: body.published,
        },
        include: {
          items: {
            orderBy: { position: "asc" },
            include: { file: { select: { id: true, title: true, pageNumber: true } } },
          },
        },
      });
    });

    await logAudit(user.email, "update", "service-plan", id, JSON.stringify(body));
    return NextResponse.json(plan);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_files");
    const { id } = await params;
    const plan = await prisma.servicePlan.findUnique({ where: { id }, select: { title: true } });
    if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Deleted outright rather than trashed: a plan is a list of pointers to
    // content that is itself never deleted here, so there is nothing to
    // recover but the order — and a service that has happened doesn't need
    // undoing.
    await prisma.servicePlan.delete({ where: { id } });
    await logAudit(user.email, "delete", "service-plan", id, plan.title);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
