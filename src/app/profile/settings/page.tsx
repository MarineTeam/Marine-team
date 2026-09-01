import { getCurrentUser, getSessionIdentity } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { isPluginEnabled } from "@/lib/plugins";
import { getShellNav } from "@/lib/nav";
import { ProfileForm } from "@/components/profile-form";
import { DeviceSettingsForm } from "@/components/device-settings-form";
import { BottomNavEditor } from "@/components/bottom-nav-editor";
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

  const [profilesOn, notificationsOn, identities, identity, nav] = await Promise.all([
    isPluginEnabled("profiles"),
    isPluginEnabled("notifications"),
    prisma.userIdentity.findMany({ where: { userId: user.id }, orderBy: { lastLoginAt: "desc" } }),
    getSessionIdentity(),
    // Already resolved once for the chrome on this same request, so the
    // picker's list of destinations costs nothing extra.
    getShellNav(),
  ]);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">This device</h2>
          <p className="mt-1 text-sm text-sec">Saved in this browser, not on your account.</p>
        </div>
        <DeviceSettingsForm />
        <BottomNavEditor options={nav.tabOptions} suggested={nav.tabs} />
      </section>

      <section className="space-y-3 border-t border-sep pt-6">
        <div>
          <h2 className="text-lg font-semibold text-ink">Account</h2>
          <p className="mt-1 text-sm text-sec">Applies everywhere you log in.</p>
        </div>
        <ProfileForm
          currentDisplayName={user.displayName}
          profilesOn={profilesOn}
          notificationsOn={notificationsOn}
          currentNotificationFrequency={user.notificationFrequency}
          currentEmailNotifications={user.emailNotifications}
          currentPhone={user.phone}
          currentSmsOptIn={user.smsOptIn}
          currentBroadcastEmails={user.broadcastEmails}
        />
      </section>

      <section className="space-y-3 border-t border-sep pt-6">
        <div>
          <h2 className="text-lg font-semibold text-ink">Sign-in methods</h2>
          <p className="mt-1 text-sm text-sec">
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

      <section className="border-t border-sep pt-6">
        <DeleteAccount email={user.email} />
      </section>
    </div>
  );
}
