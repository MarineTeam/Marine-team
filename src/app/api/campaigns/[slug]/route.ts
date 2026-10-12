import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { isPluginEnabled } from "@/lib/plugins";
import { myPledge, publicView } from "@/lib/pledges-query";

/**
 * A campaign as everybody else sees it.
 *
 * Two shapes from one route, and the split is the point. Without signing in
 * you get the church-wide totals of a campaign whose owner published them —
 * what has arrived and what was asked for, and **never** what was promised,
 * which is somebody else's money that has not moved.
 *
 * Signed in, you additionally get your own pledge, built by the rules module's
 * `visiblePledges` rather than by a query that encodes the same rule a second
 * time. Nobody gets anybody else's at any point.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    if (!(await isPluginEnabled("giving"))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const { slug } = await context.params;
    const campaign = await publicView(slug);

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ campaign }, { headers: { "Cache-Control": "private, no-store" } });
    }

    const person = await prisma.person.findFirst({
      where: { userId: user.id },
      select: { id: true, householdId: true },
    });

    return NextResponse.json(
      {
        campaign,
        mine: person
          ? (await myPledge(slug, { householdId: person.householdId, personId: person.id })).pledge
          : null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
