import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { ensureCapability, ensureStaff } from "@/lib/permissions";
import { getDisplayName } from "@/lib/profile";
import { slugify } from "@/lib/slug";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  slug: z.string().trim().max(80).optional(),
  description: z.string().max(4000).nullish(),
  meetsWhen: z.string().max(200).nullish(),
  area: z.string().max(200).nullish(),
  address: z.string().max(500).nullish(),
  published: z.boolean().optional(),
  openToJoin: z.boolean().optional(),
  capacity: z.number().int().min(0).max(1000).nullish(),
});

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const { id } = await context.params;
    const group = await prisma.smallGroup.findUnique({
      where: { id },
      include: {
        members: {
          include: { user: { select: { name: true, displayName: true, email: true } } },
          orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        },
      },
    });
    if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { members, ...rest } = group;
    return NextResponse.json({
      group: rest,
      members: members.map((member) => ({
        id: member.id,
        name: getDisplayName(member.user),
        email: member.user.email,
        role: member.role,
        status: member.status,
        note: member.note,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const { id } = await context.params;
    const body = patchSchema.parse(await request.json());
    const group = await prisma.smallGroup.update({
      where: { id },
      data: { ...body, slug: body.slug ? slugify(body.slug) || undefined : undefined },
    });
    // The address is never written to the audit log: that log is read by more
    // people than the group is.
    await logAudit(user.email, "update", "small-group", group.id, group.name);
    return NextResponse.json({ group });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const { id } = await context.params;
    const group = await prisma.smallGroup.delete({ where: { id } });
    await logAudit(user.email, "delete", "small-group", group.id, group.name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
