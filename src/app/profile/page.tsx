import { prisma } from "@/lib/db";
import { ListGroup, ListRow } from "@/components/list-group";
import {
  DownloadIcon,
  InboxIcon,
  LinkIcon,
  PlaylistIcon,
  SettingsIcon,
  SparkleIcon,
  StarIcon,
} from "@/components/icons";
import { getCurrentUser } from "@/lib/current-user";
import { getUnreadNotificationCount } from "@/lib/inbox";
import { getDownloadAccessSummary } from "@/lib/downloads";
import { getBranding } from "@/lib/branding";

/**
 * The account hub: what's waiting, and the way into each section.
 *
 * Grouped rows rather than a grid of cards, because this screen is the
 * installed app's whole account area and settings screens are a shape people
 * already know how to read — see components/list-group.tsx. Still a summary,
 * not a form; the settings themselves live on their own tab.
 */
export default async function ProfileOverviewPage() {
  const user = await getCurrentUser();
  if (!user) return null; // The layout already gates on login.

  const [unreadCount, activeShareLinks, favoriteCount, playlistCount, downloadAccess, branding] =
    await Promise.all([
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
      getBranding(),
    ]);

  return (
    <div className="space-y-6">
      <ListGroup label="This device">
        <ListRow
          href="/profile/inbox"
          icon={<InboxIcon className="h-5 w-5" />}
          label="Inbox"
          value={unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        />
        <ListRow
          href="/profile/downloads"
          icon={<DownloadIcon className="h-5 w-5" />}
          label="Downloads"
          value={downloadAccess.pluginOn && downloadAccess.permitted ? "Available" : "Off"}
        />
        <ListRow
          href="/profile/shared-links"
          icon={<LinkIcon className="h-5 w-5" />}
          label="Shared links"
          value={`${activeShareLinks} active`}
        />
      </ListGroup>

      <ListGroup label="Your library">
        <ListRow
          href="/favorites"
          icon={<StarIcon className="h-5 w-5" />}
          label="Favorites"
          value={`${favoriteCount}`}
        />
        <ListRow
          href="/playlists"
          icon={<PlaylistIcon className="h-5 w-5" />}
          label="Playlists"
          value={`${playlistCount}`}
        />
        <ListRow
          href="/watch-later"
          icon={<SparkleIcon className="h-5 w-5" />}
          label="Watch later"
        />
      </ListGroup>

      <ListGroup label="App settings">
        <ListRow
          href="/profile/settings"
          icon={<SettingsIcon className="h-5 w-5" />}
          label="Settings"
          detail="Theme, playback, and your account."
        />
      </ListGroup>

      <p className="px-1 text-center text-xs text-ter">{branding.name}</p>
    </div>
  );
}
