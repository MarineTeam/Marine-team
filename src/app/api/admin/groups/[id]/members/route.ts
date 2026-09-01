import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { prisma } from "@/lib/db";
import { ensureCapability, ensureStaff } from "@/lib/permissions";

const addSchema = z.object({
  email: z.email(),
  role: z.enum(["LEADER", "MEMBER"]).default("MEMBER"),
});

/**
 * Putting somebody in a group directly — which is how a leader gets there in
 * the first place, since a group with no leader has nobody to answer requests.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const { id } = await context.params;
    const body = addSchema.parse(await request.json());

    const member = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
      select: { id: true },
    });
    if (!member) {
      return NextResponse.json({ error: "Nobody here has that email address." }, { status: 404 });
    }

    await prisma.smallGroupMember.upsert({
      where: { groupId_userId: { groupId: id, userId: member.id } },
      create: { groupId: id, userId: member.id, role: body.role, status: "ACTIVE", respondedAt: new Date() },
      update: { role: body.role, status: "ACTIVE", respondedAt: new Date() },
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
