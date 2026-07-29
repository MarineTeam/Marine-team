import { cache } from "react";

/**
 * "Debug mode" toggle, env-controlled rather than a DB-toggled Plugin row
 * like every other optional feature — this is an ops/dev tool, not a
 * content feature, so it belongs in the deploy config, not the database.
 * Requires the literal string "true" (not just "set"), so
 * `QUERY_MONITOR_ENABLED=false` reliably disables it rather than relying on
 * presence-means-on, which would make "false" itself truthy.
 */
export function isQueryMonitorEnabled(): boolean {
  return process.env.QUERY_MONITOR_ENABLED === "true";
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
