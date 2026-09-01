import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { prisma } from "@/lib/db";
import { ensureCapability, ensureStaff } from "@/lib/permissions";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ memberId: string }> },
) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const { memberId } = await context.params;
    await prisma.smallGroupMember.delete({ where: { id: memberId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
