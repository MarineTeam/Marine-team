"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { PushNotificationToggle } from "@/components/push-notification-toggle";
import { getDisplayName } from "@/lib/profile";

type MobileMenuProps = {
  user: { name: string | null; displayName: string | null; email: string; role: string } | null;
  unauthorized: boolean;
  watchLaterOn: boolean;
  playlistsOn: boolean;
  subscriptionsOn: boolean;
  notificationsOn: boolean;
  liveStreamingOn: boolean;
  unreadCount: number;
};

export function MobileMenu({
  user,
  unauthorized,
  watchLaterOn,
  playlistsOn,
  subscriptionsOn,
  notificationsOn,
  liveStreamingOn,
  unreadCount,
}: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  // A full-screen overlay that the keyboard can't escape or dismiss is a trap,
  // and leaving the page scrollable behind it means the background moves under
  // the menu on touch. Handles Escape, scroll lock, and keeping Tab inside the
  // panel, restoring focus to the opener on close.
  useEffect(() => {
    if (!open) return;

    const opener = openerRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    // Focus the panel itself rather than the close button, so a screen reader
    // announces the dialog before its first control.
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      (opener ?? previouslyFocused)?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        ref={openerRef}
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="-m-2 rounded-md p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        <MenuIcon className="h-6 w-6" />
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          tabIndex={-1}
          className="fixed inset-0 z-50 flex flex-col bg-white outline-none dark:bg-zinc-950"
        >
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
                <p className="truncate font-medium">{getDisplayName(user)}</p>
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
              {liveStreamingOn && (
                <Link href="/live" onClick={() => setOpen(false)} className="py-3">
                  Live
                </Link>
              )}
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
              {/* Not gated on the Profiles plugin: that plugin governs display
                  names, while /profile is the account area itself — inbox,
                  shared links, settings — which a member always needs. */}
              {user && (
                <Link
                  href="/profile"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between py-3"
                >
                  <span>Profile</span>
                  {unreadCount > 0 && (
                    <span className="rounded-full bg-sky-600 px-2 text-xs leading-5 text-white">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
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
