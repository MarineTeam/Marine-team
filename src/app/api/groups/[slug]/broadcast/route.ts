import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { materialise, previewBroadcast, sendNextBatch } from "@/lib/broadcast-send";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { canLead, standingIn } from "@/lib/groups";
import { viewerFor } from "@/lib/groups-query";
import { isPluginEnabled } from "@/lib/plugins";
import { rateLimitResponse, windowStart } from "@/lib/rate-limit";

/**
 * A leader writing to their own group.
 *
 * The thread on the group's page reaches whoever opens it. This reaches
 * everybody, in their inbox — which is what a leader actually wants for "we're
 * not meeting this week" and is the standing reason a WhatsApp group survives
 * alongside all of this.
 *
 * Three things keep it from being a second broadcast tool:
 *
 *   1. **The audience is fixed to this group**, and comes from the route's
 *      own lookup rather than the body. A leader cannot address anybody they
 *      do not lead by changing an id.
 *   2. **Email only.** A text costs money per recipient, and that decision
 *      belongs with whoever holds `manage_users`, not with every leader of
 *      every group.
 *   3. **Consent still applies.** The same `planDelivery` rules as the
 *      admin's broadcasts: somebody who has turned announcement emails off
 *      has turned them off here too.
 */
export const dynamic = "force-dynamic";

const schema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10000),
  /** Ask what it would do, without doing it. */
  preview: z.boolean().optional(),
});

/** A leader may write to their group a few times a day, not fifty. */
const SENDS_PER_DAY = 5;

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    if (!(await isPluginEnabled("groups"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { slug } = await context.params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 403 });

    const group = await prisma.smallGroup.findUnique({
      where: { slug },
      include: { members: { select: { userId: true, role: true, status: true } } },
    });
    if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const viewer = await viewerFor(user);
    if (!canLead(standingIn(group.members, viewer), viewer)) {
      // 404 rather than 403: whether a group exists is not something to
      // confirm to somebody who doesn't lead it.
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = schema.parse(await request.json());

    if (body.preview) {
      return NextResponse.json(await previewBroadcast("SMALL_GROUP", group.id, ["EMAIL"]));
    }

    const limited = await rateLimitResponse(
      () =>
        prisma.broadcast.count({
          where: {
            audience: "SMALL_GROUP",
            audienceId: group.id,
            createdAt: { gte: windowStart(24 * 60 * 60) },
          },
        }),
      SENDS_PER_DAY,
    );
    if (limited) return limited;

    const broadcast = await prisma.broadcast.create({
      data: {
        subject: body.subject,
        body: body.body,
        channels: ["EMAIL"],
        // From the lookup above, never from the request.
        audience: "SMALL_GROUP",
        audienceId: group.id,
        audienceName: group.name,
        createdBy: user.email,
        status: "SENDING",
      },
    });

    await materialise(broadcast);
    const outcome = await sendNextBatch(broadcast.id);
    await logAudit(user.email, "create", "broadcast", broadcast.id, `${group.name}: ${body.subject}`);

    return NextResponse.json({ broadcastId: broadcast.id, ...outcome }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
