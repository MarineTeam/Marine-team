import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { canLead, standingIn } from "@/lib/groups";
import { groupWaitingList, pendingRequests, viewerFor } from "@/lib/groups-query";

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
    // Both lists in one answer: they are the same question — who wants in —
    // asked of two states, and a leader looking at one wants to see the other.
    const [requests, waiting] = await Promise.all([pendingRequests(group.id), groupWaitingList(group.id)]);
    return NextResponse.json({ requests, waiting });
  } catch (error) {
    return errorResponse(error);
  }
}
