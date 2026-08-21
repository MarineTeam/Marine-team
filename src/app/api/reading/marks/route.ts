import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { errorResponse } from "@/lib/api-guard";
import { canViewFile, getReadableFile } from "@/lib/content";

/** Named rather than free-form so a stored value always maps to a class the UI knows how to paint. */
export const MARK_COLORS = ["yellow", "green", "blue", "pink"] as const;

const createSchema = z.object({
  fileId: z.string().min(1),
  kind: z.enum(["HIGHLIGHT", "BOOKMARK", "NOTE"]),
  location: z.string().min(1).max(2000),
  endLocation: z.string().max(2000).nullish(),
  // Bounded: this is a copy of selected text, not a place to store a document.
  excerpt: z.string().max(2000).nullish(),
  note: z.string().max(5000).nullish(),
  color: z.enum(MARK_COLORS).default("yellow"),
});

/** Every mark this member has left in one book, oldest first. */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const fileId = request.nextUrl.searchParams.get("fileId");
    if (!fileId) return NextResponse.json({ error: "fileId is required" }, { status: 400 });

    // Marks are per-user, so this can't leak someone else's — but the file
    // check still runs, so losing access to a book also hides the notes made
    // in it rather than leaving them readable through the API.
    const file = await getReadableFile(fileId);
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await canViewFile(user, file))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const marks = await prisma.readingMark.findMany({
      where: { userId: user.id, fileId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ marks });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = createSchema.parse(await request.json());

    const file = await getReadableFile(body.fileId);
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await canViewFile(user, file))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const mark = await prisma.readingMark.create({
      data: {
        userId: user.id,
        fileId: body.fileId,
        kind: body.kind,
        location: body.location,
        endLocation: body.endLocation ?? null,
        excerpt: body.excerpt ?? null,
        note: body.note ?? null,
        color: body.color,
      },
    });
    return NextResponse.json({ mark }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
