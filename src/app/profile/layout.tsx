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
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="font-medium text-ink">Log in to see your profile.</p>
        <a
          href="/auth/login?returnTo=/profile"
          className="mt-4 inline-block rounded-full px-5 py-2 text-sm font-semibold text-white"
          style={{ background: "var(--grad-brand)" }}
        >
          Log in
        </a>
      </div>
    );
  }

  const unreadCount = await getUnreadNotificationCount(user.id);
  const name = getDisplayName(user);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:py-8">
      <h1 className="text-3xl font-bold tracking-tight text-ink">Profile</h1>

      <header className="flex items-center gap-4">
        {user.picture ? (
          // Auth0 avatars come from arbitrary provider hosts (Google, Gravatar,
          // ...), each of which would need its own next.config remotePatterns
          // entry to pass through next/image.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.picture} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
        ) : (
          <span
            aria-hidden
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white"
            style={{ background: "var(--grad-brand)" }}
          >
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-xl font-bold tracking-tight text-ink">{name}</p>
          <p className="truncate text-sm text-sec">{user.email}</p>
          <span className="mt-1.5 inline-block rounded-md bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
            {user.role === "ADMIN" ? "Admin" : "Member"}
          </span>
        </div>
      </header>

      <ProfileNav unreadCount={unreadCount} />
      {children}
    </div>
  );
}
