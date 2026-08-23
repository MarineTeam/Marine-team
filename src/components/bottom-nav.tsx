"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ICONS } from "@/components/app-sidebar";
import { isActivePath } from "@/lib/active-path";
import {
  DEVICE_SETTINGS_EVENT,
  readDeviceSettings,
  type DeviceSettings,
} from "@/lib/device-settings";
import { NAV_TABS_SNAPSHOT_KEY, resolveTabs, TABS_ACROSS, toSnapshot } from "@/lib/nav-tabs";
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
 * What it contains is the device's choice, not the app's: `tabs` is only the
 * suggestion to start from, and a device that has picked its own set (see
 * lib/nav-tabs.ts) gets that instead, resolved against `options` so a
 * destination that has since gone away drops out rather than 404ing.
 *
 * The Profile tab carries the unread badge so waiting notifications are
 * visible the way a native app shows them — without it, a member would only
 * find their inbox by going looking for it.
 */
export function BottomNav({ tabs, options }: { tabs: NavItem[]; options: NavItem[] }) {
  const pathname = usePathname();
  const barRef = useRef<HTMLElement>(null);
  // The stored choice is read after mount, not during render: it lives in
  // localStorage, which the server doesn't have, so rendering it straight
  // away would mismatch on hydration. Until then the app's suggestion shows,
  // which is also what a device that has chosen nothing keeps.
  const [chosen, setChosen] = useState<DeviceSettings["tabHrefs"]>(null);

  useEffect(() => {
    const apply = () => setChosen(readDeviceSettings().tabHrefs);
    apply();
    // Editing the bar in settings re-draws it immediately, without a reload.
    window.addEventListener(DEVICE_SETTINGS_EVENT, apply);
    return () => window.removeEventListener(DEVICE_SETTINGS_EVENT, apply);
  }, []);

  const shown = resolveTabs(options, chosen, tabs);
  // Up to five share the width, which is what a tab bar looks like. Past
  // that they keep a thumb-sized width of their own and the row scrolls
  // sideways, rather than shrinking until nothing is readable.
  const scrolls = shown.length > TABS_ACROSS;

  // Left where the offline shell can find it (public/offline.html), which is
  // a static file with no way to ask the server what the tabs are. Without
  // this, losing the connection loses the navigation with it.
  //
  // Serialized during render and written only when the result changes: this
  // component renders on every page of the site, and the bar rarely differs
  // between them.
  const snapshot = JSON.stringify(toSnapshot(shown));
  useEffect(() => {
    try {
      window.localStorage.setItem(NAV_TABS_SNAPSHOT_KEY, snapshot);
    } catch {
      // Private mode, or a full quota. The offline shell falls back to
      // listing whatever is saved on the device instead.
    }
  }, [snapshot]);

  // A bar that scrolls can open with the section you are in off to the right
  // of it, which reads as the app having lost it. Nudged into view rather
  // than scrolled with animation: this runs on every navigation.
  useEffect(() => {
    const active = barRef.current?.querySelector('[data-active="true"]');
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname, snapshot]);

  return (
    <nav
      ref={barRef}
      className={`app-tabbar pad-bottom-safe no-scrollbar fixed inset-x-0 bottom-0 z-30 flex border-t border-sep bg-panel/95 backdrop-blur sm:hidden ${
        scrolls ? "overflow-x-auto" : ""
      }`}
      aria-label="Primary"
    >
      {shown.map((tab) => {
        const Icon = NAV_ICONS[tab.icon];
        const active = isActivePath(pathname, tab.href, tab.exact);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            data-active={active ? "true" : undefined}
            className={`flex flex-col items-center gap-1 py-2 text-[11px] ${
              scrolls ? "w-[4.75rem] shrink-0" : "flex-1"
            } ${active ? "font-medium text-accent" : "text-sec"}`}
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
