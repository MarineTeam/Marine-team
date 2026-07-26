"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { PushNotificationToggle } from "@/components/push-notification-toggle";

type MobileMenuProps = {
  user: { name: string | null; email: string; role: string } | null;
  unauthorized: boolean;
  watchLaterOn: boolean;
  playlistsOn: boolean;
  subscriptionsOn: boolean;
  notificationsOn: boolean;
};

export function MobileMenu({
  user,
  unauthorized,
  watchLaterOn,
  playlistsOn,
  subscriptionsOn,
  notificationsOn,
}: MobileMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="-m-2 rounded-md p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <MenuIcon className="h-6 w-6" />
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-zinc-950">
          <div className="flex items-center gap-4 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="-m-2 rounded-md p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <CloseIcon className="h-6 w-6" />
            </button>
            <span className="font-semibold">Menu</span>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {user ? (
              <div className="mb-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
                <p className="truncate font-medium">{user.name ?? user.email}</p>
                {user.role === "ADMIN" && (
                  <Link
                    href="/admin"
                    onClick={() => setOpen(false)}
                    className="mt-2 inline-block text-sm hover:underline"
                  >
                    Admin
                  </Link>
                )}
              </div>
            ) : unauthorized ? (
              <p className="mb-4 border-b border-zinc-200 pb-4 text-amber-600 dark:border-zinc-800 dark:text-amber-500">
                Access not authorized
              </p>
            ) : null}

            <nav className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
              <Link href="/" onClick={() => setOpen(false)} className="py-3">
                Browse
              </Link>
              {user && (
                <Link href="/favorites" onClick={() => setOpen(false)} className="py-3">
                  Favorites
                </Link>
              )}
              {user && watchLaterOn && (
                <Link href="/watch-later" onClick={() => setOpen(false)} className="py-3">
                  Watch Later
                </Link>
              )}
              {user && playlistsOn && (
                <Link href="/playlists" onClick={() => setOpen(false)} className="py-3">
                  Playlists
                </Link>
              )}
              {user && subscriptionsOn && (
                <Link href="/subscriptions" onClick={() => setOpen(false)} className="py-3">
                  Subscriptions
                </Link>
              )}
              {user && notificationsOn && (
                <div className="flex items-center justify-between py-3">
                  <span>Notifications</span>
                  <PushNotificationToggle />
                </div>
              )}
            </nav>

            <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              {user || unauthorized ? (
                <a
                  href="/auth/logout"
                  className="block rounded-md border border-zinc-300 px-3 py-2 text-center hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  Log out
                </a>
              ) : (
                <a
                  href="/auth/login"
                  className="block rounded-md bg-zinc-900 px-3 py-2 text-center text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
                >
                  Log in
                </a>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden>
      <path d="M4 6.5h16M4 12h16M4 17.5h16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden>
      <path d="M5 5l14 14M19 5L5 19" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
