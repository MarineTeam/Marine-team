import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { isGuestLoginEnabled, setGuestLoginEnabled } from "@/lib/authorization";

/**
 * The master switch for /auth/guest, shown on /admin/authorized-emails next
 * to the "Guest" concept it controls access to. Gated on `manage_users`, the
 * same capability that governs everything else on that screen.
 */
export async function GET() {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_users");
    return NextResponse.json({ enabled: await isGuestLoginEnabled() });
  } catch (error) {
    return errorResponse(error);
  }
}

const patchSchema = z.object({ enabled: z.boolean() });

export async function PATCH(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_users");

    const { enabled } = patchSchema.parse(await request.json());
    await setGuestLoginEnabled(enabled);
    await logAudit(user.email, enabled ? "enable" : "disable", "guest-login", null, null);

    return NextResponse.json({ enabled });
  } catch (error) {
    return errorResponse(error);
  }
}
