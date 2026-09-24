import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { dashboard, requireNumbers } from "@/lib/service-attendance-query";

/**
 * Church life on one page.
 *
 * `view_analytics` gets you the page; what is *on* it is decided per section
 * against the viewer's other capabilities, and a section they may not see is
 * absent from the payload rather than blanked. A key that is merely null still
 * tells you the money exists and how curious to be about it.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireNumbers();
    return NextResponse.json(await dashboard(user));
  } catch (error) {
    return errorResponse(error);
  }
}
