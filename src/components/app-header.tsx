import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { MobileMenu } from "@/components/mobile-menu";
import { BellIcon, PersonIcon, SearchIcon } from "@/components/icons";
import { getCurrentUser } from "@/lib/current-user";
import { getShellNav } from "@/lib/nav";

/**
 * The top bar, in both of its forms.
 *
 * Both are rendered; CSS shows one. In a browser tab it's a website header —
 * a real search field, and a hamburger for the sections the rail would show
 * if the window were wider. Installed, it's an app bar: the wordmark and a
 * few icon targets, with getting around handled by the tab strip below.
 *
 * Rendering both rather than branching in JS is what keeps this free of a
 * hydration mismatch — the server can't know which mode the browser is in,
 * and guessing would flash the wrong chrome on every load.
 */
export async function AppHeader() {
  // getCurrentUser is React-cached and getShellNav already awaited it, so this
  // is a second read of the same result, not a second query.
  const [nav, user] = await Promise.all([getShellNav(), getCurrentUser()]);
  const { branding, account, unauthorized, unreadCount, plugins } = nav;

  const actions = (
    <HeaderActions
      accountHref={account?.href ?? null}
      accountName={account?.name ?? null}
      accountPicture={account?.picture ?? null}
      unauthorized={unauthorized}
      unreadCount={unreadCount}
    />
  );

  return (
    <>
      <header className="only-web sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-sep bg-panel px-4 sm:px-7">
        <div className="lg:hidden">
          <MobileMenu
            user={
              user
                ? { name: user.name, displayName: user.displayName, email: user.email, role: user.role }
                : null
            }
            unauthorized={unauthorized}
            watchLaterOn={plugins["watch-later"]}
            playlistsOn={plugins.playlists}
            subscriptionsOn={plugins.subscriptions}
            notificationsOn={plugins.notifications}
            liveStreamingOn={plugins["live-streaming"]}
            unreadCount={unreadCount}
          />
        </div>

        {/* The rail carries the wordmark from lg up; below that this is the only place it appears. */}
        <Link href="/" className="flex min-w-0 items-center gap-2.5 lg:hidden">
          <BrandMark branding={branding} size={30} />
          <span className="truncate text-[15px] font-bold tracking-tight text-accent">
            {branding.name}
          </span>
        </Link>

        <form action="/search" method="get" className="hidden min-w-0 flex-1 sm:block sm:max-w-[420px]">
          <div className="flex h-[38px] items-center gap-2 rounded-full bg-chip px-3.5">
            <SearchIcon className="h-4 w-4 shrink-0 text-sec" />
            <input
              type="search"
              name="q"
              placeholder="Search messages, series, books…"
              aria-label="Search"
              className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ter"
            />
          </div>
        </form>

        <div className="flex-1" />

        {/* Below sm the field above is hidden, so the icon is the way to search. */}
        <SearchLink className="sm:hidden" />
        {actions}
      </header>

      <header className="only-app pad-top-safe sticky top-0 z-30 border-b border-sep bg-panel">
        <div className="flex h-14 items-center gap-2 px-4">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <BrandMark branding={branding} size={30} />
            <span className="truncate text-[17px] font-bold tracking-tight text-accent">
              {branding.name}
            </span>
          </Link>
          <div className="flex-1" />
          <SearchLink />
          {actions}
        </div>
      </header>
    </>
  );
}

function SearchLink({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/search"
      aria-label="Search"
      className={`flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-hover ${className}`}
    >
      <SearchIcon className="h-5 w-5" />
    </Link>
  );
}

/** Notifications and the account, the same in both bars. */
function HeaderActions({
  accountHref,
  accountName,
  accountPicture,
  unauthorized,
  unreadCount,
}: {
  accountHref: string | null;
  accountName: string | null;
  accountPicture: string | null;
  unauthorized: boolean;
  unreadCount: number;
}) {
  return (
    <div className="flex items-center gap-1">
      {accountHref && (
        <Link
          href="/profile/inbox"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-hover"
        >
          <BellIcon className="h-5 w-5" />
          {unreadCount > 0 && (
            <span
              aria-hidden
              className="absolute top-1 right-1 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 font-medium text-white"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Link>
      )}

      {accountHref ? (
        <Link href={accountHref} aria-label="Account" className="ml-0.5 shrink-0">
          {accountPicture ? (
            // Auth0 avatars come from arbitrary provider hosts, each of which
            // would need its own next.config remotePatterns entry for next/image.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={accountPicture} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <span
              aria-hidden
              className="flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-bold text-white"
              style={{ background: "var(--grad-brand)" }}
            >
              {(accountName ?? "?").charAt(0).toUpperCase()}
            </span>
          )}
        </Link>
      ) : unauthorized ? (
        <>
          <span className="hidden text-[13px] text-amber-600 sm:inline dark:text-amber-500">
            Access not authorized
          </span>
          <a
            href="/auth/logout"
            className="rounded-full border border-sep px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-hover"
          >
            Log out
          </a>
        </>
      ) : (
        <a
          href="/auth/login"
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold text-white"
          style={{ background: "var(--grad-brand)" }}
        >
          <PersonIcon className="h-4 w-4" />
          Log in
        </a>
      )}
    </div>
  );
}
