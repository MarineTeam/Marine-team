import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { pollAnswer } from "@/lib/tv-pairing";
import { claimToken, findByDeviceCode } from "@/lib/tv-session";

/**
 * The television asking whether anybody has approved it yet.
 *
 * Takes the device code - the secret half - because this is the request that
 * hands out a token, and the half that is on a screen must never be able to.
 *
 * Answers "pending" for an unknown code as well as for a real one that is
 * waiting: telling a caller which of their guesses names a live pairing would
 * turn this into an oracle for finding one.
 */

const schema = z.object({ deviceCode: z.string().min(32).max(128) });

export async function POST(request: NextRequest) {
  try {
    const { deviceCode } = schema.parse(await request.json());
    const device = await findByDeviceCode(deviceCode);
    if (!device) {
      return NextResponse.json(
        { state: "pending", interval: 5 },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const answer = pollAnswer(device);
    if (answer.state !== "ready") {
      return NextResponse.json(answer, { headers: { "Cache-Control": "no-store" } });
    }

    // Conditional on the row still being APPROVED, so two polls arriving
    // together cannot both walk away with a token.
    const token = await claimToken(device.id);
    if (!token) {
      return NextResponse.json({ state: "spent" }, { headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json(
      { state: "linked", token, deviceName: device.deviceName },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
