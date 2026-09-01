import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/current-user";
import { revokeDevice } from "@/lib/tv-session";

/**
 * Signing a television out.
 *
 * The one thing a member must be able to do alone and immediately: the
 * television is in a room they may no longer be in, and it holds a token that
 * does not expire.
 */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await context.params;
    // Scoped to this member, so an id from somewhere else finds nothing
    // rather than signing out somebody else's living room.
    const revoked = await revokeDevice(user.id, id);
    if (!revoked) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
