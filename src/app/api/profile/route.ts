import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { isPluginEnabled } from "@/lib/plugins";

const schema = z.object({
  // Empty string clears the display name, falling back to the Auth0 name.
  displayName: z.string().trim().max(50).nullable(),
  notificationFrequency: z.enum(["INSTANT", "DAILY"]).optional(),
  emailNotifications: z.boolean().optional(),
});

/**
 * Sets the logged-in user's display name (gated by the Profiles plugin) and
 * push notification frequency/email opt-in (gated by the Notifications
 * plugin). Each field only applies when its own plugin is on, so disabling
 * Profiles after a member set a frequency preference doesn't also wipe that
 * preference.
 */
export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { displayName, notificationFrequency, emailNotifications } = schema.parse(await request.json());
  const [profilesOn, notificationsOn] = await Promise.all([
    isPluginEnabled("profiles"),
    isPluginEnabled("notifications"),
  ]);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(profilesOn ? { displayName: displayName || null } : {}),
      ...(notificationsOn && notificationFrequency ? { notificationFrequency } : {}),
      ...(notificationsOn && emailNotifications !== undefined ? { emailNotifications } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}
