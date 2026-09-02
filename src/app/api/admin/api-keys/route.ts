import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { API_SCOPES, cleanScopes } from "@/lib/api-keys";
import { createApiKey, listApiKeys } from "@/lib/api-keys-query";
import { logAudit } from "@/lib/audit";
import { ensureCapability, ensureStaff } from "@/lib/permissions";

/**
 * Making and listing keys for the read API.
 *
 * The created key is in the response body exactly once and is never stored in
 * the clear, so this is the only moment it exists anywhere the admin can see
 * it. That is also why it is not in the audit log: the log is read by more
 * people than the key is meant for.
 */
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(z.string()).max(20).default([]),
  /** A day, not an instant — "expires on the 31st" is how anybody says it. */
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
});

export async function GET() {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_api_keys");
    return NextResponse.json({ keys: await listApiKeys(), scopes: API_SCOPES });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_api_keys");
    const body = createSchema.parse(await request.json());

    const scopes = cleanScopes(body.scopes);
    if (scopes.length === 0) {
      // A key with nothing granted is a key that will be handed over, fail
      // silently on every call, and be debugged for an hour.
      return NextResponse.json({ error: "Tick at least one thing this key may read." }, { status: 400 });
    }

    const { key, row } = await createApiKey(
      {
        name: body.name,
        scopes,
        // End of that day, so a key set to expire on the 31st works all day on
        // the 31st — which is what somebody who typed that date meant.
        expiresAt: body.expiresOn ? new Date(`${body.expiresOn}T23:59:59.999Z`) : null,
      },
      user.email,
    );

    await logAudit(user.email, "create", "api-key", row.id, `${row.name} — ${scopes.join(", ")}`);
    return NextResponse.json({ key, id: row.id, prefix: row.prefix }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
