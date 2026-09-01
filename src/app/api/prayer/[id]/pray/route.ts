import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { canPrayFor } from "@/lib/prayer";
import { viewerFor } from "@/lib/prayer-query";

/**
 * "I prayed for this."
 *
 * A count, never a list of names: the number encourages whoever wrote the
 * request, and the names would turn it into a scoreboard. Recorded per person
 * only so that pressing it twice isn't two — which is also why it needs an
 * account.
 */
export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const user = await getCurrentUser();
    const viewer = await viewerFor(user);
    const found = await prisma.prayerRequest.findUnique({ where: { id } });
    if (!found || !user || !canPrayFor(found, viewer)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.prayerIntercession.upsert({
      where: { requestId_userId: { requestId: id, userId: user.id } },
      create: { requestId: id, userId: user.id },
      update: {},
    });
    return NextResponse.json({ prayers: await prisma.prayerIntercession.count({ where: { requestId: id } }) });
  } catch (error) {
    return errorResponse(error);
  }
}
