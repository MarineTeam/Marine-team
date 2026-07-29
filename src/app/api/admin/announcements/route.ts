import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  message: z.string().min(1),
  active: z.boolean().optional(),
  publishAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  audience: z.enum(["ALL", "GUESTS", "MEMBERS"]).optional(),
});

export async function GET() {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_plugins");
    const announcements = await prisma.announcement.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json(announcements);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_plugins");
    const body = schema.parse(await request.json());
    const announcement = await prisma.announcement.create({
      data: {
        message: body.message,
        active: body.active ?? true,
        publishAt: body.publishAt ? new Date(body.publishAt) : null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        audience: body.audience ?? "ALL",
      },
    });
    await logAudit(user.email, "create", "announcement", announcement.id, announcement.message);
    revalidateTag("announcements", { expire: 0 });
    return NextResponse.json(announcement, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
