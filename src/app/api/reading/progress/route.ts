import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { errorResponse } from "@/lib/api-guard";
import { canViewFile, getReadableFile } from "@/lib/content";
import { clampPercent } from "@/lib/reader";

const schema = z.object({
  fileId: z.string().min(1),
  // Opaque on purpose — a PDF page index or an EPUB CFI, only the reader
  // that wrote it needs to parse it. Bounded so a malformed CFI can't be
  // used to stuff the column.
  location: z.string().min(1).max(2000),
  percent: z.number(),
});

/**
 * Records where a member is in a book, so the reader reopens there.
 *
 * Unlike the video heartbeat this is only written on real navigation
 * (turning a page, jumping to a chapter), not on a timer — a reader can sit
 * on one page for twenty minutes without that meaning anything has changed.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = schema.parse(await request.json());

    // Re-checked rather than trusted: a fileId in a request body proves
    // nothing about whether this person may read that file.
    const file = await getReadableFile(body.fileId);
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await canViewFile(user, file))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const percent = clampPercent(body.percent);
    await prisma.readingProgress.upsert({
      where: { userId_fileId: { userId: user.id, fileId: body.fileId } },
      create: { userId: user.id, fileId: body.fileId, location: body.location, percent },
      update: { location: body.location, percent },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
