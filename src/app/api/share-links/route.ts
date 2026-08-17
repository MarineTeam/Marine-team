import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { errorResponse } from "@/lib/api-guard";
import { isPluginEnabled } from "@/lib/plugins";
import { rateLimitResponse, windowStart } from "@/lib/rate-limit";
import { createShareLink, getShareLinks, parseRecipientEmails } from "@/lib/share-links";

const createSchema = z.object({
  seriesId: z.string().optional(),
  videoId: z.string().optional(),
  visibility: z.enum(["PUBLIC", "EMAIL"]).default("PUBLIC"),
  /** Free text, however the sharer pasted their recipients — split by parseRecipientEmails. */
  emails: z.string().max(2000).optional(),
  note: z.string().max(200).nullable().optional(),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
});

/** A member creating links faster than this is scripting, not sharing. */
const MAX_LINKS_PER_HOUR = 20;

/** The current member's own share links, newest first, optionally for one series/video. */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const seriesId = request.nextUrl.searchParams.get("seriesId") ?? undefined;
    const videoId = request.nextUrl.searchParams.get("videoId") ?? undefined;
    return NextResponse.json(await getShareLinks({ createdById: user.id, seriesId, videoId }));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!(await isPluginEnabled("share-links"))) {
      return NextResponse.json({ error: "Share links are disabled" }, { status: 403 });
    }

    const limited = await rateLimitResponse(
      () => prisma.shareLink.count({ where: { createdById: user.id, createdAt: { gte: windowStart(3600) } } }),
      MAX_LINKS_PER_HOUR,
    );
    if (limited) return limited;

    const body = createSchema.parse(await request.json());
    if (Boolean(body.seriesId) === Boolean(body.videoId)) {
      return NextResponse.json({ error: "Share exactly one series or video" }, { status: 400 });
    }

    const link = await createShareLink({
      actor: user,
      target: body.seriesId ? { type: "series", id: body.seriesId } : { type: "video", id: body.videoId! },
      visibility: body.visibility,
      emails: parseRecipientEmails(body.emails ?? ""),
      note: body.note ?? null,
      expiresInDays: body.expiresInDays ?? null,
    });
    return NextResponse.json(link, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
