import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { canDelete } from "@/lib/prayer";
import { viewerFor } from "@/lib/prayer-query";

/** Taking your own request down, which anybody who wrote one may do at any time. */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const viewer = await viewerFor(await getCurrentUser());
    const found = await prisma.prayerRequest.findUnique({ where: { id } });
    // Not a 403: whether a request exists is itself something a stranger
    // shouldn't be able to probe for.
    if (!found || !canDelete(found, viewer)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await prisma.prayerRequest.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
