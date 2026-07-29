import { getCurrentUser } from "@/lib/current-user";
import { isQueryMonitorEnabled, getQueryMonitorSnapshot } from "@/lib/query-monitor";

function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * A Query Monitor-style debug bar (query count/time, page timing, process
 * memory) at the bottom of every page when QUERY_MONITOR_ENABLED=true.
 * Visible to ADMIN only, even when enabled — query args and timings can
 * hint at internal schema/data shape, so this mirrors WordPress's Query
 * Monitor plugin, which likewise restricts to users who can manage the
 * site rather than showing it to every visitor.
 */
export async function QueryMonitorPanel() {
  if (!isQueryMonitorEnabled()) return null;
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return null;

  const { elapsedMs, queries, totalQueryMs, memory } = getQueryMonitorSnapshot();

  return (
    <details className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-700 bg-zinc-950 text-xs text-zinc-100">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5">
        <span>⏱ {elapsedMs.toFixed(0)}ms</span>
        <span>
          🗄 {queries.length} quer{queries.length === 1 ? "y" : "ies"} ({totalQueryMs.toFixed(0)}ms)
        </span>
        <span>
          🧠 {formatMb(memory.heapUsed)} heap / {formatMb(memory.rss)} rss
        </span>
        <span className="ml-auto text-zinc-500">Query Monitor</span>
      </summary>
      <div className="max-h-64 overflow-y-auto border-t border-zinc-800 px-3 py-2">
        {queries.length === 0 ? (
          <p className="text-zinc-500">No queries recorded for this request.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left text-zinc-500">
                <th className="py-1 pr-3">Query</th>
                <th className="py-1 pr-3">Args</th>
                <th className="py-1 text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {queries.map((q, i) => (
                <tr key={i} className="border-t border-zinc-800 align-top">
                  <td className="whitespace-nowrap py-1 pr-3 font-mono">
                    {q.model ?? "?"}.{q.operation}
                  </td>
                  <td className="break-all py-1 pr-3 font-mono text-zinc-400">{q.args}</td>
                  <td className="py-1 text-right tabular-nums">{q.durationMs.toFixed(1)}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </details>
  );
}
