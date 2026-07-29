import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import { isQueryMonitorEnabled } from "@/lib/query-monitor";

export default async function QueryMonitorAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?returnTo=/admin/query-monitor");
  if (!(await hasCapability(user, "manage_plugins"))) {
    return <p className="text-sm text-zinc-500">You don&apos;t have access to this page.</p>;
  }

  const enabled = isQueryMonitorEnabled();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Query Monitor</h1>
        <p className="text-sm text-zinc-500">
          A debug bar — query count, per-query timing, page render time, and process memory — shown at
          the bottom of every page to logged-in admins, similar to WordPress&apos;s Query Monitor plugin.
          Unlike the plugins in{" "}
          <a href="/admin/plugins" className="underline">
            Plugins
          </a>
          , this is controlled entirely by an environment variable rather than a database toggle, since
          it&apos;s an ops/dev tool rather than a content feature.
        </p>
      </div>

      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">Status</p>
        <p className={`text-lg font-semibold ${enabled ? "text-green-600 dark:text-green-400" : "text-zinc-500"}`}>
          {enabled ? "Enabled" : "Disabled"}
        </p>
        <p className="mt-3 text-xs text-zinc-500">
          Set{" "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">QUERY_MONITOR_ENABLED=true</code>{" "}
          (or <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">false</code> to turn it off)
          and redeploy — this page can&apos;t flip it directly, since the setting lives in the
          environment, not the database.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Even when enabled, the debug bar only renders for logged-in <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">ADMIN</code> users
          — query text and timings can hint at internal schema/data shape, so it never shows to
          ordinary members or guests.
        </p>
      </div>
    </div>
  );
}
