import { PrismaClient } from "@prisma/client";
import { isQueryMonitorEnvEnabled, recordQuery } from "@/lib/query-monitor";

/**
 * Always wraps every model query (findMany, create, etc. — not raw
 * $queryRaw/$executeRaw calls, which Prisma extensions don't intercept the
 * same way) so the client's type stays a single, consistent shape; the
 * wrapper itself is a no-op passthrough unless QUERY_MONITOR_ENABLED is set,
 * so there's no meaningful cost in the common case. Gated on the env flag
 * only (not the DB-backed admin switch in query-monitor.ts) — checking that
 * would mean an extra DB read on every single query, so recording stays
 * cheap and the admin switch instead only affects whether the panel renders.
 */
function createClient() {
  return new PrismaClient().$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!isQueryMonitorEnvEnabled()) return query(args);
          const start = performance.now();
          const result = await query(args);
          recordQuery(model, operation, performance.now() - start, args);
          return result;
        },
      },
    },
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
