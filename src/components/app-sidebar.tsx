"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { PushNotificationToggle } from "@/components/push-notification-toggle";
import { isActivePath } from "@/lib/active-path";
import type { Branding } from "@/lib/branding";
import type { NavIcon, NavSection } from "@/lib/nav";
import {
  BellIcon,
  BookIcon,
  ClockIcon,
  DownloadIcon,
  CalendarIcon,
  FolderIcon,
  HomeIcon,
  LiveIcon,
  PersonIcon,
  PlaylistIcon,
  SearchIcon,
  ShieldIcon,
  SparkleIcon,
  StarIcon,
  CardIcon,
  TicketIcon,
} from "@/components/icons";

/**
 * Icons are chosen by name rather than passed in, because the sections are
 * assembled on the server (where the plugin states and category list live)
 * and a component can't cross that boundary as a prop. Typing the map against
 * NavIcon is what makes a new icon name a compile error here rather than a
 * blank space in the rail.
 */
export const NAV_ICONS: Record<NavIcon, (props: { className?: string }) => React.ReactElement> = {
  home: HomeIcon,
  search: SearchIcon,
  clock: ClockIcon,
  star: StarIcon,
  sparkle: SparkleIcon,
  bell: BellIcon,
  folder: FolderIcon,
  playlist: PlaylistIcon,
  book: BookIcon,
  ticket: TicketIcon,
  card: CardIcon,
  live: LiveIcon,
  person: PersonIcon,
  download: DownloadIcon,
  calendar: CalendarIcon,
  shield: ShieldIcon,
};

/**
 * The website's persistent left rail — the desktop counterpart to the tab
 * strip the installed app gets.
 *
 * Hidden below lg in both shells: at those widths an installed app navigates
 * with its bottom tabs and app bar, and a rail on a phone would eat a third of
 * the screen. Installed on a desktop it keeps the rail — width decides the
 * layout, and only the trim depends on being installed. See globals.css.
 */
export function AppSidebar({
  branding,
  sections,
  account,
  showPushToggle,
}: {
  branding: Branding;
  sections: NavSection[];
  account: { name: string; email: string; picture: string | null; href: string } | null;
  /** The old header carried this; the rail is where it lives at desktop widths now. */
  showPushToggle: boolean;
}) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 lg:block">
      <nav
        aria-label="Sections"
        className="sticky top-0 flex h-screen flex-col gap-0.5 overflow-y-auto border-r border-sep bg-panel px-3 py-5"
      >
        <Link href="/" className="mb-4 flex items-center gap-2.5 px-1">
          <BrandMark branding={branding} size={34} />
          <span className="truncate text-base font-bold tracking-tight text-ink">
            {branding.name}
          </span>
        </Link>

        {sections.map((section, index) => (
          <div key={section.label ?? `section-${index}`} className="flex flex-col gap-0.5">
            {section.label && (
              <p className="px-3 pt-3 pb-1 text-[10.5px] font-bold tracking-[0.09em] text-ter uppercase">
                {section.label}
              </p>
            )}
            {section.items.map((item) => {
              const Icon = NAV_ICONS[item.icon];
              const active = isActivePath(pathname, item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2.5 rounded-[9px] px-3 py-2.5 text-[13.5px] transition-colors ${
                    active
                      ? "bg-accent-soft font-semibold text-accent"
                      : "font-medium text-ink hover:bg-hover"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {item.badge ? (
                    <span className="ml-auto shrink-0 rounded-full bg-accent px-1.5 text-[11px] leading-5 font-medium text-white">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}

        <div className="flex-1" />

        {showPushToggle && (
          <div className="px-1 pb-2 text-[12.5px] text-sec">
            <PushNotificationToggle />
          </div>
        )}

        {account ? (
          <Link
            href={account.href}
            className="flex items-center gap-2.5 rounded-[10px] border border-sep px-3 py-2.5 transition-colors hover:bg-hover"
          >
            {account.picture ? (
              // Auth0 avatars come from arbitrary provider hosts, each of which
              // would need its own next.config remotePatterns entry for next/image.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={account.picture} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
            ) : (
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
                style={{ background: "var(--grad-brand)" }}
              >
                {account.name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] font-semibold text-ink">{account.name}</span>
              <span className="block truncate text-[11.5px] text-sec">{account.email}</span>
            </span>
          </Link>
        ) : (
          <a
            href="/auth/login"
            className="rounded-[10px] px-3 py-2.5 text-center text-[13px] font-semibold text-white"
            style={{ background: "var(--grad-brand)" }}
          >
            Log in
          </a>
        )}
      </nav>
    </aside>
  );
}
