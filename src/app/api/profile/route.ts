import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { isPluginEnabled } from "@/lib/plugins";
import { logAudit } from "@/lib/audit";
import { errorResponse } from "@/lib/api-guard";

const schema = z.object({
  // Empty string clears the display name, falling back to the Auth0 name.
  displayName: z.string().trim().max(50).nullable(),
  notificationFrequency: z.enum(["INSTANT", "DAILY"]).optional(),
  emailNotifications: z.boolean().optional(),
  /** A number the member types in themselves. Never imported from anywhere. */
  phone: z.string().trim().max(40).nullish(),
  smsOptIn: z.boolean().optional(),
  broadcastEmails: z.boolean().optional(),
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

  const body = schema.parse(await request.json());
  const { displayName, notificationFrequency, emailNotifications } = body;
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
      // Not behind the Notifications plugin: these govern church-wide
      // announcements, which are sent by hand and have nothing to do with
      // whether new sermons notify anybody.
      ...(body.phone !== undefined ? { phone: body.phone?.trim() || null } : {}),
      // Consent goes with the number: clearing the number withdraws it, so
      // nobody is left opted in to texts at an address the app no longer has.
      ...(body.smsOptIn !== undefined
        ? { smsOptIn: body.smsOptIn && Boolean(body.phone ?? user.phone) }
        : {}),
      ...(body.broadcastEmails !== undefined ? { broadcastEmails: body.broadcastEmails } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}

const deleteSchema = z.object({
  /** Typed back by the member, so a stray request can't delete an account. */
  confirmEmail: z.string().trim().toLowerCase(),
});

/**
 * Deletes the logged-in member's own account. Every relation cascades from the
 * User row (comments, notes, playlists, watch progress, push subscriptions,
 * share links they created), so this single delete takes their data with it —
 * only the AuditLog entry below survives, which stores an email rather than a
 * foreign key precisely so the record of what happened outlives the row.
 *
 * The caller is expected to send the browser to /auth/logout afterwards: the
 * Auth0 session is untouched by this, and getCurrentUser would otherwise
 * re-create the row as an unauthorized login attempt on the next request.
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { confirmEmail } = deleteSchema.parse(await request.json());
    if (confirmEmail !== user.email.toLowerCase()) {
      return NextResponse.json({ error: "That doesn't match your email address" }, { status: 400 });
    }

    // Locking out the last admin would leave nobody able to grant access
    // again — recoverable only by setting ADMIN_EMAILS and redeploying.
    if (user.role === "ADMIN") {
      const otherAdmins = await prisma.user.count({
        where: { role: "ADMIN", authorized: true, id: { not: user.id } },
      });
      if (otherAdmins === 0) {
        return NextResponse.json(
          { error: "You're the only admin. Make someone else an admin first, then delete your account." },
          { status: 409 },
        );
      }
    }

    await prisma.user.delete({ where: { id: user.id } });
    await logAudit(user.email, "delete", "account", user.id, "member deleted their own account");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
