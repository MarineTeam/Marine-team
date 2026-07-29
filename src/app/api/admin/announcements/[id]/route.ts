import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  message: z.string().min(1).optional(),
  active: z.boolean().optional(),
  publishAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  audience: z.enum(["ALL", "GUESTS", "MEMBERS"]).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_plugins");
    const { id } = await params;
    const body = schema.parse(await request.json());
    const announcement = await prisma.announcement.update({
      where: { id },
      data: {
        ...body,
        publishAt: body.publishAt === undefined ? undefined : body.publishAt ? new Date(body.publishAt) : null,
        expiresAt: body.expiresAt === undefined ? undefined : body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });
    await logAudit(user.email, "update", "announcement", id, JSON.stringify(body));
    revalidateTag("announcements", { expire: 0 });
    return NextResponse.json(announcement);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_plugins");
    const { id } = await params;
    await prisma.announcement.delete({ where: { id } });
    await logAudit(user.email, "delete", "announcement", id);
    revalidateTag("announcements", { expire: 0 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
