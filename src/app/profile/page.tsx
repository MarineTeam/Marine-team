import { getCurrentUser } from "@/lib/current-user";
import { isPluginEnabled } from "@/lib/plugins";
import { ProfileForm } from "@/components/profile-form";

export default async function ProfilePage() {
  const [user, notificationsOn] = await Promise.all([getCurrentUser(), isPluginEnabled("notifications")]);

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="font-medium">Log in to edit your profile.</p>
        <a
          href="/auth/login"
          className="mt-4 inline-block rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
        >
          Log in
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-10 space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
      <ProfileForm
        currentDisplayName={user.displayName}
        notificationsOn={notificationsOn}
        currentNotificationFrequency={user.notificationFrequency}
      />
    </div>
  );
}
