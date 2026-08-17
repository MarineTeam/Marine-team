import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { errorResponse } from "@/lib/api-guard";
import { revokeShareLink } from "@/lib/share-links";

/**
 * Finds one of the member's own links, or null. Scoped by `createdById` in the
 * query rather than fetched and then compared, so another member's id can
 * never be acted on even by accident.
 */
async function ownLink(id: string, userId: string) {
  return prisma.shareLink.findFirst({
    where: { id, createdById: userId },
    select: { id: true, revokedAt: true },
  });
}

/**
 * Revokes one of the member's own links: the link stops working immediately,
 * but the row stays in their list marked revoked, so they can still see that
 * it existed and that it's now dead.
 *
 * Available whatever the Share links plugin's state — turning the plugin off
 * stops new links being made, and must never trap someone with links they can
 * no longer switch off.
 */
export async function PATCH(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const link = await ownLink(id, user.id);
    if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!link.revokedAt) await revokeShareLink(link.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Deletes the link outright, removing it from the list entirely.
 *
 * A separate action from revoking, not a stronger version of it: revoking is
 * what you do when you want the record ("I sent this, then turned it off"),
 * deleting is for tidying a list you're done with. Either way the link stops
 * working, since the token only resolves through this row — so deleting an
 * un-revoked link is safe rather than a way to leave something live.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const link = await ownLink(id, user.id);
    if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Recipients cascade from the row (see the schema), so this takes the
    // whole share with it.
    await prisma.shareLink.delete({ where: { id: link.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
