import { getCurrentUser, getSessionIdentity } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { isPluginEnabled } from "@/lib/plugins";
import { ProfileForm } from "@/components/profile-form";
import { DeviceSettingsForm } from "@/components/device-settings-form";
import { DeleteAccount } from "@/components/delete-account";
import { SignInMethods } from "@/components/sign-in-methods";

/**
 * Two kinds of setting on one page, in this order deliberately: the per-device
 * ones a member changes often (theme, playback) come first, then the account
 * ones that follow them everywhere, then deletion at the bottom.
 */
export default async function ProfileSettingsPage() {
  const user = await getCurrentUser();
  if (!user) return null; // The layout already gates on login.

  const [profilesOn, notificationsOn, identities, identity] = await Promise.all([
    isPluginEnabled("profiles"),
    isPluginEnabled("notifications"),
    prisma.userIdentity.findMany({ where: { userId: user.id }, orderBy: { lastLoginAt: "desc" } }),
    getSessionIdentity(),
  ]);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-medium">This device</h2>
          <p className="mt-1 text-sm text-zinc-500">Saved in this browser, not on your account.</p>
        </div>
        <DeviceSettingsForm />
      </section>

      <section className="space-y-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <div>
          <h2 className="text-lg font-medium">Account</h2>
          <p className="mt-1 text-sm text-zinc-500">Applies everywhere you log in.</p>
        </div>
        <ProfileForm
          currentDisplayName={user.displayName}
          profilesOn={profilesOn}
          notificationsOn={notificationsOn}
          currentNotificationFrequency={user.notificationFrequency}
          currentEmailNotifications={user.emailNotifications}
        />
      </section>

      <section className="space-y-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <div>
          <h2 className="text-lg font-medium">Sign-in methods</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Ways you&apos;ve signed in to this account. Any of them gets you to the same place — your
            history, notes and saved items are shared across all of them.
          </p>
        </div>
        <SignInMethods
          methods={identities.map((row) => ({
            id: row.id,
            provider: row.provider,
            email: row.email,
            emailVerified: row.emailVerified,
            lastLoginAt: row.lastLoginAt,
            isCurrent: row.sub === identity?.sub,
          }))}
        />
      </section>

      <section className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <DeleteAccount email={user.email} />
      </section>
    </div>
  );
}
