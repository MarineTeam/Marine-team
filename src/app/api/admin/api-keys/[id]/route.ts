import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { revokeApiKey } from "@/lib/api-keys-query";
import { logAudit } from "@/lib/audit";
import { ensureCapability, ensureStaff } from "@/lib/permissions";

/**
 * Turning a key off.
 *
 * The row survives, so the list still shows that the key existed, who made it
 * and when it was last used — the first three things anybody wants to know
 * after deciding one has leaked.
 */
export const dynamic = "force-dynamic";

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_api_keys");
    const { id } = await context.params;

    if (!(await revokeApiKey(id))) {
      return NextResponse.json({ error: "That key is already off, or gone." }, { status: 404 });
    }
    await logAudit(user.email, "revoke", "api-key", id, null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
