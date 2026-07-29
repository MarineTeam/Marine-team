import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { reportComment } from "@/lib/content";
import { prisma } from "@/lib/db";

/** Any logged-in member can flag a comment for moderator attention; repeat reports from the same member don't double-count. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const comment = await prisma.comment.findUnique({ where: { id }, select: { id: true } });
  if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await reportComment(id, user.id);
  return NextResponse.json({ ok: true });
}
