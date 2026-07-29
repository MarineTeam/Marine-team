import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  url: z.string().url().optional(),
  secret: z.string().trim().max(200).nullable().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_plugins");
    const { id } = await params;
    const body = schema.parse(await request.json());
    const webhook = await prisma.webhook.update({ where: { id }, data: body });
    await logAudit(user.email, "update", "webhook", id, JSON.stringify(body));
    return NextResponse.json(webhook);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_plugins");
    const { id } = await params;
    await prisma.webhook.delete({ where: { id } });
    await logAudit(user.email, "delete", "webhook", id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
