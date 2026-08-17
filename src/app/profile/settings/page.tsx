import { getCurrentUser } from "@/lib/current-user";
import { isPluginEnabled } from "@/lib/plugins";
import { ProfileForm } from "@/components/profile-form";
import { DeviceSettingsForm } from "@/components/device-settings-form";
import { DeleteAccount } from "@/components/delete-account";

/**
 * Two kinds of setting on one page, in this order deliberately: the per-device
 * ones a member changes often (theme, playback) come first, then the account
 * ones that follow them everywhere, then deletion at the bottom.
 */
export default async function ProfileSettingsPage() {
  const user = await getCurrentUser();
  if (!user) return null; // The layout already gates on login.

  const [profilesOn, notificationsOn] = await Promise.all([
    isPluginEnabled("profiles"),
    isPluginEnabled("notifications"),
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

      <section className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <DeleteAccount email={user.email} />
      </section>
    </div>
  );
}
