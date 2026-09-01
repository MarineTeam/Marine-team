import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { ensureCapability, ensureStaff } from "@/lib/permissions";

const schema = z.object({
  /** The message to silence the author of — moderating happens by message. */
  messageId: z.string(),
  /** True also takes down everything they have written on this stream. */
  removeTheirs: z.boolean().default(true),
});

/**
 * Stopping somebody writing in this stream's chat.
 *
 * Per stream. Silencing somebody for one evening is the proportionate act
 * while a service is going on; a site-wide ban is a decision made elsewhere,
 * calmly, on a different screen.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "moderate_comments");
    const { id } = await context.params;
    const body = schema.parse(await request.json());

    const message = await prisma.liveChatMessage.findUnique({ where: { id: body.messageId } });
    if (!message || message.streamId !== id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.liveChatMute.upsert({
        where: { streamId_userId: { streamId: id, userId: message.userId } },
        create: { streamId: id, userId: message.userId, mutedBy: user.email },
        update: { mutedBy: user.email },
      }),
      // Usually the point: somebody who has to be muted mid-service has
      // generally written more than the one message that was noticed.
      ...(body.removeTheirs
        ? [
            prisma.liveChatMessage.updateMany({
              where: { streamId: id, userId: message.userId },
              data: { hidden: true },
            }),
          ]
        : []),
    ]);

    await logAudit(user.email, "update", "live-chat-mute", message.userId, message.authorName);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
