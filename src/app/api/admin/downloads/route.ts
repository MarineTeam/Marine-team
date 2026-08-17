import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { getDownloadPolicy } from "@/lib/downloads";

const schema = z.object({
  platform: z.enum(["WEB", "PWA", "BOTH"]).optional(),
  audience: z.enum(["ALL_MEMBERS", "SPECIFIC"]).optional(),
  maxDeviceGb: z.number().int().min(1).max(512).optional(),
  /** Full replacement lists, not deltas — the UI edits the whole set at once. */
  groupIds: z.array(z.string()).max(100).optional(),
  userEmails: z.array(z.string().trim().toLowerCase()).max(500).optional(),
});

/**
 * The site-wide download policy. Gated on `manage_plugins`, the same
 * capability as the other site-settings pages (plugins, homepage rows,
 * announcements) — this is a feature switch, not content management.
 */
export async function GET() {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_plugins");
    return NextResponse.json(await getDownloadPolicy());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_plugins");
    const body = schema.parse(await request.json());

    // Emails rather than ids, so an admin can grant download access to
    // someone who hasn't logged in yet — the same pre-authorization the
    // access and viewer-grant screens allow. Unknown emails are reported
    // back rather than silently dropped.
    let userIds: string[] | undefined;
    let unknownEmails: string[] = [];
    if (body.userEmails) {
      const found = await prisma.user.findMany({
        where: { email: { in: body.userEmails } },
        select: { id: true, email: true },
      });
      userIds = found.map((u) => u.id);
      const foundEmails = new Set(found.map((u) => u.email));
      unknownEmails = body.userEmails.filter((email) => !foundEmails.has(email));
    }

    const policy = await prisma.downloadPolicy.upsert({
      where: { id: "singleton" },
      create: {
        platform: body.platform,
        audience: body.audience,
        maxDeviceGb: body.maxDeviceGb,
        ...(body.groupIds ? { groups: { create: body.groupIds.map((groupId) => ({ groupId })) } } : {}),
        ...(userIds ? { users: { create: userIds.map((userId) => ({ userId })) } } : {}),
      },
      update: {
        ...(body.platform ? { platform: body.platform } : {}),
        ...(body.audience ? { audience: body.audience } : {}),
        ...(body.maxDeviceGb ? { maxDeviceGb: body.maxDeviceGb } : {}),
        // Replace wholesale: simpler than diffing, and the lists are small.
        ...(body.groupIds
          ? { groups: { deleteMany: {}, create: body.groupIds.map((groupId) => ({ groupId })) } }
          : {}),
        ...(userIds ? { users: { deleteMany: {}, create: userIds.map((userId) => ({ userId })) } } : {}),
      },
      include: {
        groups: { select: { groupId: true, group: { select: { name: true } } } },
        users: { select: { userId: true, user: { select: { email: true, name: true, displayName: true } } } },
      },
    });

    await logAudit(
      user.email,
      "update",
      "download-policy",
      policy.id,
      `platform=${policy.platform} audience=${policy.audience}`,
    );
    return NextResponse.json({ ...policy, unknownEmails });
  } catch (error) {
    return errorResponse(error);
  }
}
