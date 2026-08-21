"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ICONS } from "@/components/app-sidebar";
import { isActivePath } from "@/lib/active-path";
import type { NavItem } from "@/lib/nav";

/**
 * The bottom tab strip.
 *
 * On the website it's the phone-width fallback for the left rail. In the
 * installed app it's the primary navigation at every width, which is what the
 * `app-tabbar` class buys: the rule in globals.css keeps it on past the `sm`
 * breakpoint when the app is running standalone, where `sm:hidden` would
 * otherwise take away the only way to get around.
 *
 * The Profile tab carries the unread badge so waiting notifications are
 * visible the way a native app shows them — without it, a member would only
 * find their inbox by going looking for it.
 */
export function BottomNav({ tabs }: { tabs: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      className="app-tabbar pad-bottom-safe fixed inset-x-0 bottom-0 z-30 flex border-t border-sep bg-panel/95 backdrop-blur sm:hidden"
      aria-label="Primary"
    >
      {tabs.map((tab) => {
        const Icon = NAV_ICONS[tab.icon];
        const active = isActivePath(pathname, tab.href, tab.exact);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-1 py-2 text-[11px] ${
              active ? "font-medium text-accent" : "text-sec"
            }`}
          >
            <span className="relative">
              <Icon className="h-6 w-6" />
              {tab.badge ? (
                <span
                  aria-hidden
                  className="absolute -top-1 -right-1.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 font-medium text-white"
                >
                  {tab.badge > 9 ? "9+" : tab.badge}
                </span>
              ) : null}
            </span>
            <span className="max-w-full truncate px-0.5">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
