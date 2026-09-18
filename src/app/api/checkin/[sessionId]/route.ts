import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { isPluginEnabled } from "@/lib/plugins";
import { checkIn, closeSession, findFamilies, register, release, requireDesk } from "@/lib/checkin-query";

/**
 * One room: who is in it, who is arriving, and who is going home.
 *
 * Search, check-in and release are all POSTs to this one route with an
 * `action`, rather than three routes — the desk is one screen doing one job,
 * and a volunteer's tablet reconnecting should not have to know which of three
 * URLs its half-finished action belonged to.
 */
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("search"), query: z.string().trim().max(80) }),
  z.object({
    action: z.literal("check-in"),
    childId: z.string().min(1).max(60),
    broughtById: z.string().min(1).max(60).nullish(),
  }),
  z.object({
    action: z.literal("release"),
    childId: z.string().min(1).max(60),
    code: z.string().max(20).optional(),
    collectorId: z.string().min(1).max(60).nullish(),
    // An override always carries its reason; the rules refuse a blank one.
    overrideReason: z.string().trim().max(500).optional(),
  }),
  z.object({ action: z.literal("close") }),
]);

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function GET(_request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  try {
    if (!(await isPluginEnabled("checkin"))) return notFound();
    await requireDesk();
    const { sessionId } = await context.params;
    return NextResponse.json(await register(sessionId), {
      // The register carries medical notes. Nothing caches it, anywhere.
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  try {
    if (!(await isPluginEnabled("checkin"))) return notFound();
    const user = await requireDesk();
    const { sessionId } = await context.params;
    const body = schema.parse(await request.json());

    switch (body.action) {
      case "search":
        return NextResponse.json(
          { families: await findFamilies(body.query, sessionId) },
          { headers: { "Cache-Control": "private, no-store" } },
        );

      case "check-in":
        return NextResponse.json(
          await checkIn({
            sessionId,
            childId: body.childId,
            broughtById: body.broughtById ?? null,
            byEmail: user.email,
          }),
          { status: 201 },
        );

      case "release":
        return NextResponse.json(
          await release({
            sessionId,
            childId: body.childId,
            presentedCode: body.code ?? "",
            collectorId: body.collectorId ?? null,
            byEmail: user.email,
            override: body.overrideReason ? { reason: body.overrideReason } : null,
          }),
        );

      case "close":
        return NextResponse.json(await closeSession(sessionId, user.email));
    }
  } catch (error) {
    return errorResponse(error);
  }
}
