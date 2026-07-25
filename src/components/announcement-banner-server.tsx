import { AnnouncementBanner } from "@/components/announcement-banner";
import { getActiveAnnouncement } from "@/lib/content";
import { isPluginEnabled } from "@/lib/plugins";

export async function AnnouncementBannerServer() {
  const announcementsOn = await isPluginEnabled("announcements");
  const announcement = announcementsOn ? await getActiveAnnouncement() : null;
  if (!announcement) return null;
  return <AnnouncementBanner id={announcement.id} message={announcement.message} />;
}
