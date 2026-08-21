"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon, Sheet } from "@/components/sheet";
import { currentAdminLabel, isAdminLinkActive, type ResolvedAdminGroup } from "@/lib/admin-nav";

/**
 * The admin's section navigation.
 *
 * Two treatments of the same grouped list. On a wide screen it's a rail with
 * headings, sticky so it stays put while a long table scrolls. On a phone it
 * collapses to one button that names the section you're in and opens the rest
 * in a sheet — replacing a horizontal scroller that held twenty-four links,
 * showed about four of them, and never said which one you were on.
 *
 * `aria-current` marks the open section in both, which the old nav had no
 * notion of at all.
 */
export function AdminNav({ groups }: { groups: ResolvedAdminGroup[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);

  const active = (href: string) => isAdminLinkActive(pathname, href);

  const groupList = (onNavigate?: () => void) =>
    groups.map((group, index) => (
      <div key={group.label ?? `group-${index}`} className="flex flex-col gap-0.5">
        {group.label && (
          <p className="px-3 pt-3 pb-1 text-[10.5px] font-bold tracking-[0.09em] text-zinc-500 uppercase">
            {group.label}
          </p>
        )}
        {group.links.map((link) => {
          const on = active(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavigate}
              aria-current={on ? "page" : undefined}
              className={`block rounded-md px-3 py-2 text-sm ${
                on
                  ? "bg-zinc-200 font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-white"
                  : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    ));

  return (
    <>
      {/* Phone: one button that says where you are. */}
      <div className="sm:hidden">
        <button
          type="button"
          ref={openerRef}
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="flex w-full items-center gap-2.5 rounded-lg border border-zinc-300 px-3 py-2.5 text-sm dark:border-zinc-700"
        >
          <MenuIcon className="h-5 w-5 shrink-0 text-zinc-500" />
          <span className="text-zinc-500">Admin</span>
          <span aria-hidden className="text-zinc-300 dark:text-zinc-600">
            /
          </span>
          <span className="truncate font-semibold">{currentAdminLabel(groups, pathname)}</span>
        </button>

        <Sheet open={open} onClose={close} title="Admin sections" returnFocusTo={openerRef}>
          <nav aria-label="Admin sections" className="flex flex-col gap-3">
            {groupList(close)}
          </nav>
        </Sheet>
      </div>

      {/*
        Desktop: the rail. `self-start` is what makes the sticky work — as a
        flex child it would otherwise be stretched to the full height of the
        row and have nowhere to stick to.
      */}
      <nav
        aria-label="Admin sections"
        className="sticky top-24 hidden max-h-[calc(100vh-8rem)] w-52 shrink-0 flex-col gap-2 self-start overflow-y-auto sm:flex"
      >
        {groupList()}
      </nav>
    </>
  );
}
