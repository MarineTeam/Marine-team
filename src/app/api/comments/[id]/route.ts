import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";

/** A comment can be deleted by whoever wrote it, an admin, or a moderate_comments capability holder scoped to it. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const comment = await prisma.comment.findUnique({
    where: { id },
    include: { series: true, video: { include: { series: true } } },
  });
  if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (comment.userId !== user.id) {
    const categoryId = comment.series?.categoryId ?? comment.video?.series?.categoryId ?? null;
    const seriesId = comment.seriesId ?? comment.video?.seriesId ?? undefined;
    const canModerate = await hasCapability(user, "moderate_comments", { categoryId, seriesId });
    if (!canModerate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.comment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
