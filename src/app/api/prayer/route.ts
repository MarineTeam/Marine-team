import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { isPluginEnabled } from "@/lib/plugins";
import { listPrayers, viewerFor } from "@/lib/prayer-query";
import { getDisplayName } from "@/lib/profile";
import { notifySubscribers } from "@/lib/push";
import { rateLimitResponse, windowStart } from "@/lib/rate-limit";

/**
 * The wall, and adding to it.
 *
 * Nothing written here appears anywhere until a moderator lets it through.
 * That is not a setting: an unmoderated prayer wall on a church website is a
 * liability with a "post" button, and the day it is abused is the day somebody
 * would have gone looking for the switch.
 */

const createSchema = z.object({
  body: z.string().trim().min(1, "Please write something.").max(2000),
  name: z.string().trim().max(120).nullish(),
  anonymous: z.boolean().optional(),
  visibility: z.enum(["EVERYONE", "MEMBERS", "LEADERS"]).optional(),
});

/** Ten a minute across the whole wall is a script, not a congregation. */
const MAX_PER_MINUTE = 10;

export async function GET() {
  try {
    if (!(await isPluginEnabled("prayer"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const viewer = await viewerFor(await getCurrentUser());
    return NextResponse.json({ requests: await listPrayers(viewer) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("prayer"))) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const limited = await rateLimitResponse(
      () => prisma.prayerRequest.count({ where: { createdAt: { gte: windowStart(60) } } }),
      MAX_PER_MINUTE,
    );
    if (limited) return limited;

    const user = await getCurrentUser();
    const body = createSchema.parse(await request.json());

    const created = await prisma.prayerRequest.create({
      data: {
        userId: user?.id ?? null,
        // Taken from the account at the time of writing rather than read back
        // later, so changing a display name doesn't rewrite old requests.
        name: body.anonymous ? null : (body.name?.trim() || (user ? getDisplayName(user) : null)),
        body: body.body,
        anonymous: body.anonymous ?? false,
        // A visitor can't ask for the members-only wall, because they can't
        // see it — the request would vanish from under them.
        visibility: user ? (body.visibility ?? "MEMBERS") : "EVERYONE",
      },
    });

    await notifyModerators(created.id);
    return NextResponse.json({ id: created.id, status: created.status }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Tells whoever moderates that something is waiting.
 *
 * Deliberately says nothing about what it says: a push notification lands on a
 * lock screen, and the whole reason this queue exists is that some of what
 * goes into it is not for a lock screen.
 */
async function notifyModerators(requestId: string): Promise<void> {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  const granted = await prisma.groupAssignment.findMany({
    where: { group: { capabilities: { has: "moderate_prayer" } } },
    select: { userId: true },
  });
  const ids = [...new Set([...admins.map((a) => a.id), ...granted.map((g) => g.userId)])];
  if (ids.length === 0) return;

  await notifySubscribers(
    {
      title: "A prayer request is waiting",
      body: "Somebody has written to the prayer wall.",
      url: `/admin/prayer#${requestId}`,
    },
    ids,
  );
}
