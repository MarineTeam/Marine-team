import { API_SCOPES } from "@/lib/api-keys";
import { ok, withAnyKey } from "@/lib/api-v1";

/** What this key is and what it may read — the first call anybody makes. */
export const dynamic = "force-dynamic";

export const GET = withAnyKey(async ({ key }) =>
  ok({
    name: key.name,
    prefix: key.prefix,
    scopes: key.scopes,
    // Spelled out, so a developer doesn't have to look up what each one means.
    grants: API_SCOPES.filter((entry) => key.scopes.includes(entry.scope)).map((entry) => ({
      scope: entry.scope,
      description: entry.description,
    })),
    createdAt: key.createdAt.toISOString(),
    expiresAt: key.expiresAt?.toISOString() ?? null,
  }),
);
