import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureAdmin, errorResponse } from "@/lib/api-guard";

const updateSchema = z.object({
  role: z.enum(["MEMBER", "ADMIN"]),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureAdmin();
    const { id } = await params;
    const body = updateSchema.parse(await request.json());
    const user = await prisma.user.update({ where: { id }, data: { role: body.role } });
    return NextResponse.json(user);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await ensureAdmin();
    const { id } = await params;
    if (id === admin.id) {
      return NextResponse.json(
        { error: "You can't revoke your own access" },
        { status: 400 },
      );
    }
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
