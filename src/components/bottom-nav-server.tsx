import { BottomNav } from "@/components/bottom-nav";
import { isPluginEnabled } from "@/lib/plugins";
import { getCurrentUser } from "@/lib/current-user";
import { getUnreadNotificationCount } from "@/lib/inbox";

export async function BottomNavServer() {
  const [watchHistoryOn, user] = await Promise.all([isPluginEnabled("watch-history"), getCurrentUser()]);
  const unreadCount = user ? await getUnreadNotificationCount(user.id) : 0;

  return <BottomNav watchHistoryOn={watchHistoryOn} loggedIn={Boolean(user)} unreadCount={unreadCount} />;
}
