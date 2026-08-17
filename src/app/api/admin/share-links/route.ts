import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { createShareLink, getShareLinks, parseRecipientEmails } from "@/lib/share-links";

const createSchema = z.object({
  seriesId: z.string().optional(),
  videoId: z.string().optional(),
  visibility: z.enum(["PUBLIC", "EMAIL"]).default("PUBLIC"),
  emails: z.string().max(2000).optional(),
  note: z.string().max(200).nullable().optional(),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
});

/**
 * Every share link on the site, whoever created it — the admin view of who
 * has handed out access to what, and the place to shut a link down.
 *
 * Gated on `share_content` rather than `manage_users`: it's the same
 * capability that lets someone share restricted content in the first place,
 * so a group given sharing rights can also police its own links.
 */
export async function GET() {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "share_content");
    return NextResponse.json(await getShareLinks({}));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "share_content");

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
    await logAudit(
      user.email,
      "create",
      "share-link",
      link.id,
      `${link.visibility === "EMAIL" ? "private" : "public"} link to ${link.video?.title ?? link.series?.title ?? "?"}`,
    );
    return NextResponse.json(link, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
