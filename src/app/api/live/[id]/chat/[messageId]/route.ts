import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { hasCapability } from "@/lib/permissions";

/**
 * Taking a message down — your own, or anybody's if you moderate.
 *
 * Hidden rather than deleted: the row is what stops the same message being
 * reposted past a moderator, and it keeps the record of the decision.
 */
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ messageId: string }> },
) {
  try {
    const { messageId } = await context.params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const message = await prisma.liveChatMessage.findUnique({ where: { id: messageId } });
    if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const moderates = await hasCapability(user, "moderate_comments");
    if (!moderates && message.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.liveChatMessage.update({ where: { id: messageId }, data: { hidden: true } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
