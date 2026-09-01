import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { previewBroadcast } from "@/lib/broadcast-send";
import { prisma } from "@/lib/db";
import { ensureCapability, ensureStaff } from "@/lib/permissions";
import { smsConfig, smsUnavailableReason } from "@/lib/sms-send";

/**
 * Composing a broadcast, and asking what it would do.
 *
 * Gated on `manage_users` rather than `manage_events`: writing to every member
 * at once is closer to holding the membership list than to booking the hall,
 * and the people trusted with one are not automatically the people trusted
 * with the other.
 */

const AUDIENCES = ["EVERYONE", "PERMISSION_GROUP", "EVENT", "SMALL_GROUP", "TEAM"] as const;
const CHANNELS = ["EMAIL", "SMS", "PUSH"] as const;

const createSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  channels: z.array(z.enum(CHANNELS)).min(1),
  audience: z.enum(AUDIENCES),
  audienceId: z.string().nullish(),
  audienceName: z.string().max(200).nullish(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_users");
    const url = new URL(request.url);

    // `?preview=1` answers "who would this reach", which is the question
    // somebody has before pressing send rather than after.
    if (url.searchParams.get("preview") === "1") {
      const audience = z.enum(AUDIENCES).parse(url.searchParams.get("audience") ?? "EVERYONE");
      const channels = (url.searchParams.get("channels") ?? "EMAIL")
        .split(",")
        .filter((channel): channel is (typeof CHANNELS)[number] =>
          (CHANNELS as readonly string[]).includes(channel),
        );
      const plan = await previewBroadcast(audience, url.searchParams.get("audienceId"), channels);
      return NextResponse.json({
        peopleReached: plan.peopleReached,
        peopleMissed: plan.peopleMissed,
        perChannel: plan.perChannel,
        unreachable: plan.unreachable,
        smsReady: smsConfig() !== null,
        smsReason: smsConfig() ? null : smsUnavailableReason(),
      });
    }

    const broadcasts = await prisma.broadcast.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { _count: { select: { recipients: true } } },
    });
    return NextResponse.json({
      broadcasts: broadcasts.map(({ _count, ...broadcast }) => ({
        ...broadcast,
        recipientCount: _count.recipients,
      })),
      smsReady: smsConfig() !== null,
      smsReason: smsConfig() ? null : smsUnavailableReason(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_users");
    const body = createSchema.parse(await request.json());

    const broadcast = await prisma.broadcast.create({
      data: {
        subject: body.subject,
        body: body.body,
        channels: body.channels,
        audience: body.audience,
        audienceId: body.audienceId ?? null,
        // Copied rather than looked up later, so the list of past broadcasts
        // still reads sensibly once the group is renamed or deleted.
        audienceName: body.audienceName ?? null,
        createdBy: user.email,
      },
    });
    await logAudit(user.email, "create", "broadcast", broadcast.id, broadcast.subject);
    return NextResponse.json(broadcast, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
