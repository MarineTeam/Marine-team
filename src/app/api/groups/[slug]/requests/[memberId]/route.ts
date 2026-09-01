import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { activeMembers, canLead, standingIn } from "@/lib/groups";
import { viewerFor } from "@/lib/groups-query";
import { notifySubscribers } from "@/lib/push";

const patchSchema = z.object({ accept: z.boolean() });

/**
 * A leader answering somebody who asked.
 *
 * This is the moment the address becomes theirs, which is why it is a person's
 * decision and not a button on the group page.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ slug: string; memberId: string }> },
) {
  try {
    const { slug, memberId } = await context.params;
    const viewer = await viewerFor(await getCurrentUser());
    const group = await prisma.smallGroup.findUnique({ where: { slug }, include: { members: true } });
    if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canLead(standingIn(group.members, viewer), viewer)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const asking = group.members.find((member) => member.id === memberId);
    if (!asking || asking.status !== "REQUESTED") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { accept } = patchSchema.parse(await request.json());
    if (accept && group.capacity !== null && activeMembers(group.members).length >= group.capacity) {
      return NextResponse.json({ error: "This group is full." }, { status: 409 });
    }

    await prisma.smallGroupMember.update({
      where: { id: memberId },
      data: { status: accept ? "ACTIVE" : "DECLINED", respondedAt: new Date() },
    });

    // Only a yes is a notification. A no is a conversation, and a push saying
    // "you were turned down" is the wrong way for anybody to hear it.
    if (accept) {
      await notifySubscribers(
        {
          title: `You're in: ${group.name}`,
          body: group.meetsWhen ? `Meets ${group.meetsWhen}.` : "The group's details are on its page.",
          url: `/groups/${group.slug}`,
        },
        [asking.userId],
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
