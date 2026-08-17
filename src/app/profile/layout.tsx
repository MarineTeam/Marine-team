import { getCurrentUser } from "@/lib/current-user";
import { getUnreadNotificationCount } from "@/lib/inbox";
import { getDisplayName } from "@/lib/profile";
import { ProfileNav } from "@/components/profile-nav";

/**
 * Wraps every /profile page in the same identity header and section nav, so
 * the profile reads as one place on both the web and the installed PWA — the
 * tabs are the app's account area, not a row of unrelated pages.
 *
 * The login gate lives here rather than in each page for the same reason.
 */
export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="font-medium">Log in to see your profile.</p>
        <a
          href="/auth/login?returnTo=/profile"
          className="mt-4 inline-block rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
        >
          Log in
        </a>
      </div>
    );
  }

  const unreadCount = await getUnreadNotificationCount(user.id);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <header className="flex items-center gap-3">
        {user.picture ? (
          // Auth0 avatars come from arbitrary provider hosts (Google, Gravatar,
          // ...), each of which would need its own next.config remotePatterns
          // entry to pass through next/image.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.picture} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-lg font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {getDisplayName(user).charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{getDisplayName(user)}</h1>
          <p className="truncate text-sm text-zinc-500">{user.email}</p>
        </div>
      </header>

      <ProfileNav unreadCount={unreadCount} />
      {children}
    </div>
  );
}
