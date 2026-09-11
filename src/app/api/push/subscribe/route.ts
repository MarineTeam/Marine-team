import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { isPushServiceEndpoint, subscriptionsToEvict } from "@/lib/push-endpoint";

/**
 * Saves a browser's Web Push subscription for the logged-in member.
 *
 * Two things this route refuses that it used to take. An endpoint anywhere
 * but a browser's push service — because the server POSTs to every stored
 * endpoint on every notification, and a URL a member chose would have made it
 * POST wherever they liked. And a ninth subscription without dropping the
 * oldest — because rows here multiply outbound requests, and nothing used to
 * stop one member holding a thousand. See lib/push-endpoint.ts.
 */

const schema = z.object({
  endpoint: z
    .string()
    .max(2048)
    .refine((url) => isPushServiceEndpoint(url), "That isn't a push service this site sends to."),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = schema.parse(await request.json());

    // Room for this one: the oldest go first, since a browser re-subscribes
    // when its endpoint changes and the oldest rows are the ones most likely
    // already dead. The endpoint being re-saved is excluded from the count.
    const others = await prisma.pushSubscription.findMany({
      where: { userId: user.id, NOT: { endpoint: body.endpoint } },
      select: { id: true, createdAt: true },
    });
    const evict = subscriptionsToEvict(others).map((row) => row.id);

    await prisma.$transaction([
      ...(evict.length > 0 ? [prisma.pushSubscription.deleteMany({ where: { id: { in: evict } } })] : []),
      prisma.pushSubscription.upsert({
        where: { endpoint: body.endpoint },
        create: {
          userId: user.id,
          endpoint: body.endpoint,
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
        },
        update: { userId: user.id, p256dh: body.keys.p256dh, auth: body.keys.auth },
      }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
