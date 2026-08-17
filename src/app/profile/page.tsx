import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { getUnreadNotificationCount } from "@/lib/inbox";
import { getDownloadAccessSummary } from "@/lib/downloads";

/**
 * The profile's landing card: what's waiting for the member, and the way in
 * to each section. Deliberately a summary rather than a settings form — the
 * settings live on their own tab so this stays readable on a phone.
 */
export default async function ProfileOverviewPage() {
  const user = await getCurrentUser();
  if (!user) return null; // The layout already gates on login.

  const [unreadCount, activeShareLinks, favoriteCount, playlistCount, downloadAccess] = await Promise.all([
    getUnreadNotificationCount(user.id),
    prisma.shareLink.count({
      where: {
        createdById: user.id,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    }),
    prisma.videoFavorite.count({ where: { userId: user.id } }),
    prisma.playlist.count({ where: { userId: user.id } }),
    getDownloadAccessSummary(user),
  ]);

  const cards = [
    {
      href: "/profile/inbox",
      label: "Inbox",
      value: unreadCount > 0 ? `${unreadCount} unread` : "All caught up",
      detail: "New content, announcements, and links shared with you.",
    },
    {
      href: "/profile/shared-links",
      label: "Shared links",
      value: `${activeShareLinks} active`,
      detail: "Links you've handed out, and the switch to revoke them.",
    },
    {
      href: "/profile/downloads",
      label: "Downloads",
      value: downloadAccess.pluginOn && downloadAccess.permitted ? "Available" : "Off",
      detail: "Videos saved to this device, and when they may use mobile data.",
    },
    {
      href: "/profile/settings",
      label: "Settings",
      value: "This device",
      detail: "Theme, playback, and your account.",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-lg border border-zinc-200 p-4 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            <p className="text-sm text-zinc-500">{card.label}</p>
            <p className="mt-0.5 font-medium">{card.value}</p>
            <p className="mt-1 text-xs text-zinc-500">{card.detail}</p>
          </Link>
        ))}
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Your library</h2>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link
            href="/favorites"
            className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Favorites ({favoriteCount})
          </Link>
          <Link
            href="/playlists"
            className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Playlists ({playlistCount})
          </Link>
          <Link
            href="/watch-later"
            className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Watch later
          </Link>
          <Link
            href="/recently-played"
            className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Recently played
          </Link>
        </div>
      </section>
    </div>
  );
}
