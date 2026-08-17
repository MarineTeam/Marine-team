import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { errorResponse } from "@/lib/api-guard";
import { revokeShareLink } from "@/lib/share-links";

/**
 * Revokes one of the member's own links. Sets `revokedAt` rather than
 * deleting the row, so the link stays in their list marked revoked — the
 * sharer can see that it existed and that it's now dead.
 *
 * Revoking is available whatever the Share links plugin's state: turning the
 * plugin off stops new links being made, and must never trap someone with
 * links they can no longer switch off.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const link = await prisma.shareLink.findFirst({
      where: { id, createdById: user.id },
      select: { id: true, revokedAt: true },
    });
    if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!link.revokedAt) await revokeShareLink(link.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
