import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { revokeShareLink } from "@/lib/share-links";

/**
 * Revokes any member's share link. This is the cleanup path for a sharer who
 * has since left, or whose sharing permission was withdrawn — an existing
 * link keeps working until someone turns it off, and this is where that
 * happens. Audited, since it's an action taken on someone else's link.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "share_content");

    const { id } = await params;
    const link = await prisma.shareLink.findUnique({
      where: { id },
      select: { id: true, revokedAt: true, createdBy: { select: { email: true } } },
    });
    if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!link.revokedAt) {
      await revokeShareLink(link.id);
      await logAudit(user.email, "revoke", "share-link", link.id, `link shared by ${link.createdBy.email}`);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
