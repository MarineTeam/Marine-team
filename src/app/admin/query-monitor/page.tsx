import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import { isQueryMonitorEnvEnabled, isQueryMonitorAdminEnabled } from "@/lib/query-monitor";
import { QueryMonitorAdminToggle } from "@/components/query-monitor-admin-toggle";

function StatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${
        enabled
          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
          : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
      }`}
    >
      {enabled ? "On" : "Off"}
    </span>
  );
}

export default async function QueryMonitorAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?returnTo=/admin/query-monitor");
  if (!(await hasCapability(user, "manage_plugins"))) {
    return <p className="text-sm text-zinc-500">You don&apos;t have access to this page.</p>;
  }

  const envEnabled = isQueryMonitorEnvEnabled();
  const adminEnabled = await isQueryMonitorAdminEnabled();
  const effectiveEnabled = envEnabled && adminEnabled;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Query Monitor</h1>
        <p className="text-sm text-zinc-500">
          A debug bar — query count, per-query timing, page render time, and process memory — shown at
          the bottom of every page to logged-in admins, similar to WordPress&apos;s Query Monitor plugin.
          Two switches gate it, and both have to be on.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <p className="text-sm text-zinc-500">Effective status</p>
          <p
            className={`text-lg font-semibold ${
              effectiveEnabled ? "text-green-600 dark:text-green-400" : "text-zinc-500"
            }`}
          >
            {effectiveEnabled ? "On" : "Off"}
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium">Environment flag</p>
              <StatusBadge enabled={envEnabled} />
            </div>
            <p className="text-sm text-zinc-500">
              <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">QUERY_MONITOR_ENABLED</code> — set
              in your deploy config, not here. Flipping it requires a redeploy; this page can only report
              its current value.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium">Admin switch</p>
              <StatusBadge enabled={adminEnabled} />
            </div>
            <p className="text-sm text-zinc-500">
              A second, database-backed switch you control right here — e.g. to hide the bar without
              waiting on a redeploy. Only matters while the environment flag above is also on.
            </p>
          </div>
          <QueryMonitorAdminToggle initialEnabled={adminEnabled} />
        </div>
      </div>

      <p className="text-xs text-zinc-500">
        Even when both switches are on, the bar only renders for logged-in{" "}
        <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">ADMIN</code> users — query text and
        timings can hint at internal schema/data shape, so it never shows to ordinary members or guests.
      </p>
    </div>
  );
}
