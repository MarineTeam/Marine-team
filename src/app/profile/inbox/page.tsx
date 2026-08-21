import { getCurrentUser } from "@/lib/current-user";
import { getNotifications } from "@/lib/inbox";
import { isPluginEnabled } from "@/lib/plugins";
import { InboxList } from "@/components/inbox-list";
import { PushNotificationToggle } from "@/components/push-notification-toggle";

/**
 * Everything the site has sent this member, kept whether or not they ever
 * allowed push — see recordNotifications. Rendered on the server so the list
 * is there on first paint, with the client component taking over for
 * read/delete.
 */
export default async function ProfileInboxPage() {
  const user = await getCurrentUser();
  if (!user) return null; // The layout already gates on login.

  const [notifications, notificationsOn] = await Promise.all([
    getNotifications(user.id),
    isPluginEnabled("notifications"),
  ]);

  const items = notifications.map((n) => ({
    ...n,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">Inbox</h2>
        {notificationsOn && <PushNotificationToggle />}
      </div>
      <InboxList initialItems={items} />
    </div>
  );
}
