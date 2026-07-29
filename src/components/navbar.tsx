import Link from "next/link";
import { getCurrentUser, getSessionIdentity } from "@/lib/current-user";
import { getPluginStates } from "@/lib/plugins";
import { getDisplayName } from "@/lib/profile";
import { PushNotificationToggle } from "@/components/push-notification-toggle";
import { MobileMenu } from "@/components/mobile-menu";

export async function Navbar() {
  const [user, identity, plugins] = await Promise.all([
    getCurrentUser(),
    getSessionIdentity(),
    getPluginStates(),
  ]);
  const watchLaterOn = plugins["watch-later"];
  const notificationsOn = plugins.notifications;
  const subscriptionsOn = plugins.subscriptions;
  const playlistsOn = plugins.playlists;
  const profilesOn = plugins.profiles;
  const liveStreamingOn = plugins["live-streaming"];
  const unauthorized = !user && identity !== null;

  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur sticky top-0 z-10 dark:bg-zinc-950/80 dark:border-zinc-800">
      <nav className="max-w-6xl mx-auto flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="font-semibold text-lg tracking-tight shrink-0">
          Marine Team
        </Link>
        <form action="/search" method="get" className="order-3 w-full sm:order-none sm:w-auto sm:flex-1 sm:max-w-xs">
          <input
            type="search"
            name="q"
            placeholder="Search…"
            className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </form>
        <div className="hidden sm:flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-4 text-sm sm:ml-auto">
          <Link href="/" className="hover:underline">
            Browse
          </Link>
          {liveStreamingOn && (
            <Link href="/live" className="hover:underline">
              Live
            </Link>
          )}
          {user?.role === "ADMIN" && (
            <Link href="/admin" className="hover:underline">
              Admin
            </Link>
          )}
          {user && (
            <Link href="/favorites" className="hover:underline">
              Favorites
            </Link>
          )}
          {user && watchLaterOn && (
            <Link href="/watch-later" className="hover:underline">
              Watch Later
            </Link>
          )}
          {user && playlistsOn && (
            <Link href="/playlists" className="hover:underline">
              Playlists
            </Link>
          )}
          {user && subscriptionsOn && (
            <Link href="/subscriptions" className="hover:underline">
              Subscriptions
            </Link>
          )}
          {user && profilesOn && (
            <Link href="/profile" className="hover:underline">
              Profile
            </Link>
          )}
          {user && notificationsOn && <PushNotificationToggle />}
          {user ? (
            <>
              <span className="text-zinc-500 max-w-[10rem] sm:max-w-none truncate">
                {getDisplayName(user)}
              </span>
              <a
                href="/auth/logout"
                className="rounded-md border border-zinc-300 px-3 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Log out
              </a>
            </>
          ) : unauthorized ? (
            <>
              <span className="text-amber-600 dark:text-amber-500">Access not authorized</span>
              <a
                href="/auth/logout"
                className="rounded-md border border-zinc-300 px-3 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Log out
              </a>
            </>
          ) : (
            <a
              href="/auth/login"
              className="rounded-md bg-zinc-900 text-white px-3 py-1 hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
            >
              Log in
            </a>
          )}
        </div>
        <div className="sm:hidden ml-auto">
          <MobileMenu
            user={user ? { name: user.name, displayName: user.displayName, email: user.email, role: user.role } : null}
            unauthorized={unauthorized}
            watchLaterOn={watchLaterOn}
            playlistsOn={playlistsOn}
            subscriptionsOn={subscriptionsOn}
            notificationsOn={notificationsOn}
            profilesOn={profilesOn}
            liveStreamingOn={liveStreamingOn}
          />
        </div>
      </nav>
    </header>
  );
}
