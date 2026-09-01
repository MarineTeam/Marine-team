import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { rateLimitResponse, windowStart } from "@/lib/rate-limit";
import { canApprove, isWellFormedUserCode, normalizeUserCode } from "@/lib/tv-pairing";

/**
 * A member saying yes - or no - to a code they have typed in.
 *
 * Signed in, always: approving a television is granting it this account, and
 * the point of the whole flow is that the account holder is the one at the
 * keyboard.
 *
 * Rate limited per member rather than per address. Six characters from a
 * twenty-seven character alphabet is 387 million, which is plenty against a
 * ten-minute window and a handful of guesses a minute, and hopeless against
 * somebody allowed to try thousands.
 */

const schema = z.object({
  code: z.string().max(20),
  approve: z.boolean().default(true),
});

const MAX_ATTEMPTS_PER_MINUTE = 10;

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 403 });

    // Counted against pairings this member has touched recently, which is the
    // closest thing to "guesses" the schema can see.
    const limited = await rateLimitResponse(
      () =>
        prisma.tvDevice.count({
          where: { userId: user.id, approvedAt: { gte: windowStart(60) } },
        }),
      MAX_ATTEMPTS_PER_MINUTE,
    );
    if (limited) return limited;

    const body = schema.parse(await request.json());
    const code = normalizeUserCode(body.code);
    if (!isWellFormedUserCode(code)) {
      return NextResponse.json({ error: "That code doesn't look right." }, { status: 400 });
    }

    const device = await prisma.tvDevice.findUnique({ where: { userCode: code } });
    // One message for "no such code" and for "that code has expired": which
    // of the two it is says whether a guess found something.
    if (!device || !canApprove(device)) {
      return NextResponse.json(
        { error: "That code has expired or doesn't exist. Check the screen and try again." },
        { status: 404 },
      );
    }

    await prisma.tvDevice.update({
      where: { id: device.id },
      data: body.approve
        ? { status: "APPROVED", userId: user.id, approvedAt: new Date() }
        : { status: "DENIED", approvedAt: new Date() },
    });

    await logAudit(
      user.email,
      "update",
      "tv-device",
      device.id,
      body.approve ? `approved ${device.deviceName}` : "denied",
    );
    return NextResponse.json({ ok: true, deviceName: device.deviceName, approved: body.approve });
  } catch (error) {
    return errorResponse(error);
  }
}
