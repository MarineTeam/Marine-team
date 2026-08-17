"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { href: "/profile", label: "Overview", exact: true },
  { href: "/profile/inbox", label: "Inbox", exact: false },
  { href: "/profile/shared-links", label: "Shared links", exact: false },
  { href: "/profile/downloads", label: "Downloads", exact: false },
  { href: "/profile/settings", label: "Settings", exact: false },
] as const;

/**
 * The profile's section tabs. Scrolls sideways rather than wrapping on narrow
 * screens, matching the admin sidebar's mobile behavior — in the PWA this is
 * the account area's whole navigation, so the tabs need to stay on one line.
 */
export function ProfileNav({ unreadCount }: { unreadCount: number }) {
  const pathname = usePathname();

  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 text-sm" aria-label="Profile sections">
      {SECTIONS.map(({ href, label, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 ${
              active
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            {label}
            {href === "/profile/inbox" && unreadCount > 0 && (
              <span
                className={`rounded-full px-1.5 text-[11px] tabular-nums ${
                  active ? "bg-white/20 dark:bg-zinc-900/20" : "bg-sky-600 text-white"
                }`}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
