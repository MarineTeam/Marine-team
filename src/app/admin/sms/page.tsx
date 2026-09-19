import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import { isPluginEnabled } from "@/lib/plugins";
import { SmsInbox } from "@/components/sms-inbox";

/**
 * Replies to the texts this app sends.
 *
 * Beside broadcasts and sharing their grant: this is where the answers to
 * those land, and whoever writes to everybody should be reading what comes
 * back.
 */
export const dynamic = "force-dynamic";

export default async function AdminSmsPage() {
  if (!(await isPluginEnabled("sms-inbox"))) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?returnTo=/admin/sms");
  if (!(await hasCapability(user, "manage_users"))) {
    return <p className="text-sm text-zinc-500">You don&apos;t have access to this.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Text replies</h1>
        <p className="mt-1 text-sm text-sec">
          Threaded by number rather than by account, because most of the people a church texts
          don&apos;t have one. A reply saying STOP is acted on here rather than left for somebody to
          notice.
        </p>
      </div>
      <SmsInbox />
    </div>
  );
}
