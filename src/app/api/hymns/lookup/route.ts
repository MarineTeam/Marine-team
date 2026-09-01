import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/current-user";
import { canViewFile, getReadableFile } from "@/lib/content";

/**
 * Records that a hymn was opened, for "what does this congregation actually
 * sing" in the admin analytics.
 *
 * Posted from the browser rather than counted when a page renders, because
 * Next prefetches links on hover — counting renders would largely count
 * mice. See HymnLookup.
 *
 * The access check is the same as opening the hymn, so this can't be used to
 * find out whether a members-only book exists; and a `keepalive` beacon from
 * a page being navigated away from is the normal case, so it answers with
 * nothing rather than a body nobody reads.
 */
const schema = z.object({
  fileId: z.string().min(1).max(60),
  number: z.number().int().min(1).max(9999).nullable().optional(),
  source: z.enum(["hymn", "book", "reader", "present"]),
});

export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await request.json());

    const [user, file] = await Promise.all([getCurrentUser(), getReadableFile(body.fileId)]);
    if (!file) return new NextResponse(null, { status: 204 });
    if (!(await canViewFile(user, file))) return new NextResponse(null, { status: 204 });

    await prisma.hymnLookup.create({
      data: {
        fileId: file.id,
        number: body.number ?? null,
        source: body.source,
        userId: user?.id ?? null,
      },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
