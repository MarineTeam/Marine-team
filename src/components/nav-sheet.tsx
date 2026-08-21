"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { NAV_ICONS } from "@/components/app-sidebar";
import { PushNotificationToggle } from "@/components/push-notification-toggle";
import { MenuIcon, Sheet } from "@/components/sheet";
import type { NavSection } from "@/lib/nav";

/**
 * The full navigation, as a sheet over the page.
 *
 * It exists in both shells, and that is the point: the left rail only appears
 * from `lg` up, so without this there is no way to reach Live, Playlists,
 * Subscriptions, Watch later or the category list on a phone — and in the
 * installed app, where there is no browser chrome to fall back on, no way at
 * all. The bottom tabs carry five destinations; everything else is here.
 *
 * It renders the same `sections` the rail is built from rather than its own
 * list of links, so the two cannot drift — which is exactly what happened to
 * the hardcoded menu this replaces: it kept offering "Browse" long after the
 * rail had grown a Library section, and never learned about Downloads.
 */
export function NavSheet({
  sections,
  account,
  unauthorized,
  unreadCount,
  showPushToggle,
}: {
  sections: NavSection[];
  account: { name: string; email: string; picture: string | null; href: string } | null;
  unauthorized: boolean;
  unreadCount: number;
  showPushToggle: boolean;
}) {
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        ref={openerRef}
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="-m-2 rounded-md p-2 text-ink hover:bg-hover"
      >
        <MenuIcon className="h-6 w-6" />
      </button>

      <Sheet open={open} onClose={close} title="Menu" returnFocusTo={openerRef}>
        {account ? (
          <Link
            href={account.href}
            onClick={close}
            className="mb-4 flex items-center gap-3 rounded-xl border border-sep p-3 hover:bg-hover"
          >
            {account.picture ? (
              // Auth0 avatars come from arbitrary provider hosts, each of which
              // would need its own next.config remotePatterns entry.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={account.picture} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
            ) : (
              <span
                aria-hidden
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ background: "var(--grad-brand)" }}
              >
                {account.name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate font-medium text-ink">{account.name}</span>
              <span className="block truncate text-sm text-sec">{account.email}</span>
            </span>
            {unreadCount > 0 && (
              <span className="ml-auto shrink-0 rounded-full bg-accent px-2 text-xs leading-5 font-medium text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
        ) : unauthorized ? (
          <p className="mb-4 border-b border-sep pb-4 text-amber-600 dark:text-amber-500">
            Access not authorized
          </p>
        ) : null}

        <nav aria-label="All sections" className="flex flex-col gap-4">
          {sections.map((section, index) => (
            <div key={section.label ?? `section-${index}`} className="flex flex-col gap-0.5">
              {section.label && (
                <p className="px-2 pb-1 text-[11px] font-bold tracking-[0.08em] text-ter uppercase">
                  {section.label}
                </p>
              )}
              {section.items.map((item) => {
                const Icon = NAV_ICONS[item.icon];
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={close}
                    className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-ink hover:bg-hover"
                  >
                    <Icon className="h-5 w-5 shrink-0 text-accent" />
                    <span className="truncate">{item.label}</span>
                    {item.badge ? (
                      <span className="ml-auto shrink-0 rounded-full bg-accent px-2 text-xs leading-5 font-medium text-white">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {showPushToggle && (
          <div className="mt-4 flex items-center justify-between border-t border-sep pt-4 text-ink">
            <span>Notifications</span>
            <PushNotificationToggle />
          </div>
        )}

        <div className="mt-4 border-t border-sep pt-4">
          {account || unauthorized ? (
            <a
              href="/auth/logout"
              className="block rounded-full border border-sep px-3 py-2 text-center text-ink hover:bg-hover"
            >
              Log out
            </a>
          ) : (
            <a
              href="/auth/login"
              className="block rounded-full px-3 py-2 text-center font-semibold text-white"
              style={{ background: "var(--grad-brand)" }}
            >
              Log in
            </a>
          )}
        </div>
      </Sheet>
    </>
  );
}
