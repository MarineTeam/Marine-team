import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { prisma } from "@/lib/db";
import { promoteFromWaitlist } from "@/lib/groups-query";
import { ensureCapability, ensureStaff } from "@/lib/permissions";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ memberId: string }> },
) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const { memberId } = await context.params;
    const removed = await prisma.smallGroupMember.delete({ where: { id: memberId } });
    // Taking somebody out frees a place, so the waiting list is offered it in
    // the same breath rather than at whoever-notices-first.
    await promoteFromWaitlist(removed.groupId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
