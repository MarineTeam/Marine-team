import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { ensureCapability, ensureStaff } from "@/lib/permissions";

const patchSchema = z.object({ handled: z.boolean() });

/**
 * Marking a card as dealt with.
 *
 * The point of a connect card is the follow-up, and the way follow-up fails is
 * two people each assuming the other did it. Who marked it is recorded so the
 * answer to "did anyone ring them" is a name rather than a tick.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ submissionId: string }> },
) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const { submissionId } = await context.params;
    const { handled } = patchSchema.parse(await request.json());

    const submission = await prisma.formSubmission.update({
      where: { id: submissionId },
      data: handled
        ? { handledAt: new Date(), handledBy: user.email }
        : { handledAt: null, handledBy: null },
    });
    return NextResponse.json({ submission });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ submissionId: string }> },
) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const { submissionId } = await context.params;
    await prisma.formSubmission.delete({ where: { id: submissionId } });
    await logAudit(user.email, "delete", "form-submission", submissionId, null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
