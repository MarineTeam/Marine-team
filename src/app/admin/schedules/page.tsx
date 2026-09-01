import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import { isPluginEnabled } from "@/lib/plugins";
import { googleSheetsConfigured, serviceAccountEmail } from "@/lib/sheets/credentials";
import { ScheduleManager } from "@/components/schedule-manager";

/**
 * The rotas this church runs — the other kind of schedule from the service
 * rota next door.
 *
 * That one puts accounts against a service's running order. This one puts
 * *names* against recurring rotas, most of them people who never log in, and
 * can read them out of a spreadsheet somebody already keeps.
 */
export default async function AdminSchedulesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?returnTo=/admin/schedules");
  if (!(await hasCapability(user, "manage_files"))) {
    return <p className="text-sm text-zinc-500">You don&apos;t have access to schedules.</p>;
  }

  const pluginOn = await isPluginEnabled("schedules");
  const sheets = googleSheetsConfigured();
  const shareWith = serviceAccountEmail();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Schedules</h1>
        <p className="mt-1 text-sm text-sec">
          Rotas anybody can read at <code>/calendar</code>, without an account: they choose their
          name once on their device and see what they are on for. Events come from a Google Sheet
          or are managed here, and nothing downstream knows the difference.
        </p>
        {!pluginOn && (
          <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            The <strong>Schedules</strong> plugin is switched off, so <code>/calendar</code> is
            hidden from members. Schedules can still be prepared here.
          </p>
        )}
        {sheets && shareWith && (
          <p className="mt-2 text-xs text-sec">
            Share each spreadsheet with <code>{shareWith}</code> as a Viewer. This is the step
            people forget; without it Google answers 403.
          </p>
        )}
        <p className="mt-2 text-sm">
          <Link href="/admin/people" className="text-accent hover:underline">
            People →
          </Link>{" "}
          <span className="text-sec">the names on these rotas, and merging duplicates.</span>
        </p>
      </div>

      <ScheduleManager sheetsConfigured={sheets} />
    </div>
  );
}
