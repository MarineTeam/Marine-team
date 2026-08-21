import { getCurrentUser } from "@/lib/current-user";
import { isQueryMonitorEnvEnabled, isQueryMonitorAdminEnabled, getQueryMonitorSnapshot } from "@/lib/query-monitor";
import { QueryMonitorRefresher } from "@/components/query-monitor-refresher";

function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * A Query Monitor-style debug bar (query count/time, page timing, process
 * memory) at the bottom of every page — shown only when QUERY_MONITOR_ENABLED
 * is set AND the admin switch at /admin/query-monitor is on, and even then
 * only to logged-in ADMIN users. Query args and timings can hint at internal
 * schema/data shape, so this mirrors WordPress's Query Monitor plugin, which
 * likewise restricts to users who can manage the site rather than showing it
 * to every visitor. The env check runs first and is synchronous, so a
 * disabled deploy never pays for the admin-switch DB read or the user lookup.
 */
export async function QueryMonitorPanel() {
  if (!isQueryMonitorEnvEnabled()) return null;
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return null;
  if (!(await isQueryMonitorAdminEnabled())) return null;

  const { elapsedMs, queries, totalQueryMs, memory } = getQueryMonitorSnapshot();

  return (
    <>
      <QueryMonitorRefresher />
      <details className="fixed inset-x-0 bottom-0 z-50 border-t border-sep bg-zinc-950 text-xs text-zinc-100">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5">
          <span>⏱ {elapsedMs.toFixed(0)}ms</span>
          <span>
            🗄 {queries.length} quer{queries.length === 1 ? "y" : "ies"} ({totalQueryMs.toFixed(0)}ms)
          </span>
          <span>
            🧠 {formatMb(memory.heapUsed)} heap / {formatMb(memory.rss)} rss
          </span>
          <span className="ml-auto text-sec">Query Monitor</span>
        </summary>
        {/* overflow-x as well as -y: a long SQL statement would otherwise push
            the whole page sideways on a phone. */}
        <div className="max-h-64 overflow-x-auto overflow-y-auto border-t border-sep px-3 py-2">
          {queries.length === 0 ? (
            <p className="text-sec">No queries recorded for this request.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left text-sec">
                  <th className="py-1 pr-3">Query</th>
                  <th className="py-1 pr-3">Args</th>
                  <th className="py-1 text-right">Time</th>
                </tr>
              </thead>
              <tbody>
                {queries.map((q, i) => (
                  <tr key={i} className="border-t border-sep align-top">
                    <td className="whitespace-nowrap py-1 pr-3 font-mono">
                      {q.model ?? "?"}.{q.operation}
                    </td>
                    <td className="break-all py-1 pr-3 font-mono text-ter">{q.args}</td>
                    <td className="py-1 text-right tabular-nums">{q.durationMs.toFixed(1)}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </details>
    </>
  );
}
