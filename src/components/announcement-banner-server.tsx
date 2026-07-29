import { AnnouncementBanner } from "@/components/announcement-banner";
import { getActiveAnnouncement } from "@/lib/content";
import { getCurrentUser } from "@/lib/current-user";
import { isPluginEnabled } from "@/lib/plugins";

export async function AnnouncementBannerServer() {
  const [announcementsOn, user] = await Promise.all([isPluginEnabled("announcements"), getCurrentUser()]);
  const announcement = announcementsOn ? await getActiveAnnouncement(Boolean(user)) : null;
  if (!announcement) return null;
  return <AnnouncementBanner id={announcement.id} message={announcement.message} />;
}
