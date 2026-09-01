import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { approvalPrompt, canApprove, isWellFormedUserCode, normalizeUserCode } from "@/lib/tv-pairing";

/**
 * What a member is about to approve, before they approve it.
 *
 * Its own step so the confirmation can name the device: the one attack this
 * flow cannot design away is somebody being talked into typing a code from a
 * screen that is not theirs, and the defence is telling them plainly what
 * they are agreeing to.
 *
 * Signed in, like the approval itself - an unauthenticated version would let
 * anybody test whether a code was live.
 */

const schema = z.object({ code: z.string().max(20) });

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 403 });

    const code = normalizeUserCode(schema.parse(await request.json()).code);
    if (!isWellFormedUserCode(code)) {
      return NextResponse.json({ error: "That code doesn't look right." }, { status: 400 });
    }

    const device = await prisma.tvDevice.findUnique({ where: { userCode: code } });
    if (!device || !canApprove(device)) {
      return NextResponse.json(
        { error: "That code has expired or doesn't exist. Check the screen and try again." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      deviceName: device.deviceName,
      deviceKind: device.deviceKind,
      prompt: approvalPrompt(device.deviceName),
      expiresAt: device.expiresAt.toISOString(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
