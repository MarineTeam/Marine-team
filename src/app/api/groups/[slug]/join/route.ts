import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { joinState } from "@/lib/groups";
import { viewerFor } from "@/lib/groups-query";
import { isPluginEnabled } from "@/lib/plugins";
import { getDisplayName } from "@/lib/profile";
import { notifySubscribers } from "@/lib/push";

/**
 * Asking to join, and leaving.
 *
 * Asking is a *request*, never a join: the leader decides. That is not
 * ceremony — it is what stops anybody with an account from learning where a
 * leader lives by pressing a button, since the address travels only with an
 * answered yes.
 */

const joinSchema = z.object({ note: z.string().trim().max(500).nullish() });

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    if (!(await isPluginEnabled("groups"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { slug } = await context.params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Sign in to ask to join a group." }, { status: 403 });

    const group = await prisma.smallGroup.findUnique({
      where: { slug },
      include: { members: true },
    });
    if (!group || !group.published) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const viewer = await viewerFor(user);
    const state = joinState(group, group.members, viewer);
    if (state !== "open") {
      return NextResponse.json({ error: "You can't join this group right now." }, { status: 409 });
    }

    const body = joinSchema.parse(await request.json().catch(() => ({})));
    await prisma.smallGroupMember.upsert({
      where: { groupId_userId: { groupId: group.id, userId: user.id } },
      // A previous "no" becomes a fresh ask rather than a locked door — people
      // and circumstances change, and the leader is asked again either way.
      update: { status: "REQUESTED", note: body.note ?? null, respondedAt: null },
      create: { groupId: group.id, userId: user.id, note: body.note ?? null },
    });

    const leaders = group.members.filter(
      (member) => member.role === "LEADER" && member.status === "ACTIVE",
    );
    if (leaders.length > 0) {
      await notifySubscribers(
        {
          title: `${getDisplayName(user)} would like to join ${group.name}`,
          body: body.note ?? "They've asked to join your group.",
          url: `/groups/${group.slug}`,
        },
        leaders.map((leader) => leader.userId),
      );
    }

    return NextResponse.json({ status: "REQUESTED" }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Leaving, or withdrawing a request. Always yours to do. */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const group = await prisma.smallGroup.findUnique({ where: { slug }, select: { id: true } });
    if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.smallGroupMember.deleteMany({ where: { groupId: group.id, userId: user.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
