import { cache } from "react";
import { prisma } from "@/lib/db";

/**
 * The env flag is the deploy-level kill switch — off here means the query
 * capture machinery in src/lib/db.ts doesn't run at all, not just "hidden".
 * Requires the word "true" (case-insensitive, since env var UIs like
 * Vercel's don't normalize casing and "TRUE" is a natural thing to type),
 * so `QUERY_MONITOR_ENABLED=false` reliably disables it rather than relying
 * on presence-means-on, which would make "false" itself truthy.
 */
export function isQueryMonitorEnvEnabled(): boolean {
  return process.env.QUERY_MONITOR_ENABLED?.toLowerCase() === "true";
}

/**
 * Slug for the DB-backed admin on/off switch (src/app/admin/query-monitor,
 * src/app/api/admin/query-monitor). Deliberately not in PLUGIN_META
 * (src/lib/plugins.ts) — this is an ops/dev tool, not a content feature, so
 * it doesn't belong on /admin/plugins or support per-category overrides —
 * but it reuses the same `Plugin` table/shape rather than a bespoke model,
 * since "a named boolean toggle" is exactly what that table already is.
 */
export const QUERY_MONITOR_ADMIN_SLUG = "query-monitor";

/**
 * The admin-facing switch, on top of the env flag: an admin can turn the
 * bar off (e.g. during a live demo) without touching deploy config, and it
 * comes back the moment they turn it back on — no redeploy either way.
 * Defaults to on (fails open) when no row exists yet, matching
 * getPluginStates()'s convention, so the bar isn't silently invisible the
 * first time someone sets QUERY_MONITOR_ENABLED without ever having
 * visited /admin/query-monitor.
 */
export async function isQueryMonitorAdminEnabled(): Promise<boolean> {
  const row = await prisma.plugin.findUnique({ where: { slug: QUERY_MONITOR_ADMIN_SLUG } });
  return row?.enabled ?? true;
}

/** Effective on/off state: both the env flag and the admin switch must be on. */
export async function isQueryMonitorEnabled(): Promise<boolean> {
  return isQueryMonitorEnvEnabled() && (await isQueryMonitorAdminEnabled());
}

export type QueryLogEntry = {
  model: string | undefined;
  operation: string;
  durationMs: number;
  args: string;
};

type Store = {
  startedAt: number;
  queries: QueryLogEntry[];
};

/**
 * One store per request: React's `cache()` memoizes this call for the
 * lifetime of a single render pass — the same primitive `getCurrentUser()`
 * uses (see src/lib/current-user.ts) — so every Prisma call anywhere in the
 * request's call graph, no matter how deeply nested inside
 * src/lib/content.ts, accumulates into the same object, and a concurrent,
 * unrelated request gets its own fresh one instead of a shared/global one.
 */
const getStore = cache(
  (): Store => ({
    startedAt: performance.now(),
    queries: [],
  }),
);

/** Called from the Prisma client extension in src/lib/db.ts for every query — only wired up when the monitor is enabled, so there's no cost when it's off. */
export function recordQuery(model: string | undefined, operation: string, durationMs: number, args: unknown): void {
  const store = getStore();
  let argsPreview: string;
  try {
    argsPreview = JSON.stringify(args) ?? "";
  } catch {
    argsPreview = "(unserializable args)";
  }
  store.queries.push({
    model,
    operation,
    durationMs,
    args: argsPreview.length > 200 ? `${argsPreview.slice(0, 200)}…` : argsPreview,
  });
}

export type QueryMonitorSnapshot = {
  elapsedMs: number;
  queries: QueryLogEntry[];
  totalQueryMs: number;
  memory: NodeJS.MemoryUsage;
};

/**
 * A snapshot as of whenever this is called. Rendered from the bottom of the
 * page (see QueryMonitorPanel), so in the common case it reflects the whole
 * request's query activity — though with React's streaming/Suspense a
 * slower sibling could still resolve after this snapshot is taken, the same
 * inherent approximation every other in-request timer has here.
 */
export function getQueryMonitorSnapshot(): QueryMonitorSnapshot {
  const store = getStore();
  return {
    elapsedMs: performance.now() - store.startedAt,
    queries: store.queries,
    totalQueryMs: store.queries.reduce((sum, q) => sum + q.durationMs, 0),
    memory: process.memoryUsage(),
  };
}
