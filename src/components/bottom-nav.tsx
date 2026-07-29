"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ALL_TABS = [
  { href: "/", label: "Home", icon: HomeIcon, exact: true, slug: null },
  { href: "/recently-played", label: "Recently Played", icon: ClockIcon, exact: false, slug: "watch-history" },
  { href: "/favorites", label: "Favourites", icon: StarIcon, exact: false, slug: null },
  { href: "/recently-added", label: "Recently Added", icon: SparkleIcon, exact: false, slug: null },
] as const;

export function BottomNav({ watchHistoryOn = true }: { watchHistoryOn?: boolean }) {
  const pathname = usePathname();
  const TABS = ALL_TABS.filter((tab) => tab.slug !== "watch-history" || watchHistoryOn);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex sm:hidden border-t border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      {TABS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className="flex flex-1 flex-col items-center gap-1 py-2 text-[11px]"
          >
            <Icon
              className={`h-6 w-6 ${
                active ? "text-zinc-900 dark:text-white" : "text-zinc-400 dark:text-zinc-500"
              }`}
            />
            <span
              className={
                active
                  ? "font-medium text-zinc-900 dark:text-white"
                  : "text-zinc-500 dark:text-zinc-500"
              }
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden>
      <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 9.5V19a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1V9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden>
      <path
        d="M12 4.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8L12 4.5z"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={className} aria-hidden>
      <path
        d="M11 4l1.2 3.8L16 9l-3.8 1.2L11 14l-1.2-3.8L6 9l3.8-1.2L11 4z"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M17.5 14.5l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1z" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
