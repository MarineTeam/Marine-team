import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { prisma } from "@/lib/db";
import { isPluginEnabled } from "@/lib/plugins";
import { rateLimitResponse, windowStart } from "@/lib/rate-limit";
import { formatUserCode } from "@/lib/tv-pairing";
import { startPairing } from "@/lib/tv-session";

/**
 * A television asking to be signed in.
 *
 * Answers with two codes. The short one goes on the screen for a person to
 * type; the long one stays inside the television and is the only thing that
 * can later redeem the approval. See lib/tv-pairing.ts for why they are two
 * different things.
 *
 * Unauthenticated by necessity - the whole point is that nobody has signed in
 * yet - so it is rate limited, and every pairing dies after ten minutes
 * whether or not anybody looks at it.
 */

const schema = z.object({
  deviceName: z.string().max(200).optional(),
  deviceKind: z.string().max(40).optional(),
});

/** Sixty new pairings a minute across the whole site is a script. */
const MAX_PER_MINUTE = 60;

export async function POST(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("tv"))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const limited = await rateLimitResponse(
      () => prisma.tvDevice.count({ where: { createdAt: { gte: windowStart(60) } } }),
      MAX_PER_MINUTE,
    );
    if (limited) return limited;

    const body = schema.parse(await request.json().catch(() => ({})));
    const pairing = await startPairing(body.deviceName ?? "", body.deviceKind ?? null);

    return NextResponse.json(
      {
        userCode: pairing.userCode,
        // What to actually print on the screen, so every television shows the
        // same thing and the page that reads it back knows the shape.
        displayCode: formatUserCode(pairing.userCode),
        deviceCode: pairing.deviceCode,
        verificationUrl: `${process.env.APP_BASE_URL ?? ""}/link`,
        expiresAt: pairing.expiresAt.toISOString(),
        intervalSeconds: pairing.intervalSeconds,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
