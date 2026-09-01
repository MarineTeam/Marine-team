import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { canLead, standingIn } from "@/lib/groups";
import { pendingRequests, viewerFor } from "@/lib/groups-query";

/**
 * Who has asked to join, for the leader of this group.
 *
 * A leader is not staff and has no admin page — the person who hosts the
 * Tuesday group shouldn't need a capability grant to answer somebody knocking
 * on their own door. So the check is "are you a leader of *this* group",
 * decided by the same function the page uses.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const viewer = await viewerFor(await getCurrentUser());
    const group = await prisma.smallGroup.findUnique({
      where: { slug },
      include: { members: { select: { userId: true, role: true, status: true } } },
    });
    if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canLead(standingIn(group.members, viewer), viewer)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ requests: await pendingRequests(group.id) });
  } catch (error) {
    return errorResponse(error);
  }
}
