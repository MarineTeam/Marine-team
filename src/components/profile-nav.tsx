"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActivePath } from "@/lib/active-path";

const SECTIONS = [
  { href: "/profile", label: "Overview", exact: true },
  { href: "/profile/inbox", label: "Inbox", exact: false },
  { href: "/profile/shared-links", label: "Shared links", exact: false },
  { href: "/profile/downloads", label: "Downloads", exact: false },
  { href: "/profile/settings", label: "Settings", exact: false },
] as const;

/**
 * The profile's section tabs. Scrolls sideways rather than wrapping on narrow
 * screens — in the PWA this is the account area's whole navigation, and with
 * no back button in the app bar it is also the only way out of a sub-page, so
 * the tabs need to stay on one line and stay present.
 */
export function ProfileNav({ unreadCount }: { unreadCount: number }) {
  const pathname = usePathname();

  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 text-sm" aria-label="Profile sections">
      {SECTIONS.map(({ href, label, exact }) => {
        const active = isActivePath(pathname, href, exact);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 whitespace-nowrap transition-colors ${
              active ? "bg-accent-soft font-semibold text-accent" : "text-sec hover:bg-hover"
            }`}
          >
            {label}
            {href === "/profile/inbox" && unreadCount > 0 && (
              <span className="rounded-full bg-accent px-1.5 text-[11px] tabular-nums text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
