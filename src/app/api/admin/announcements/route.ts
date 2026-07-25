import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const schema = z.object({ message: z.string().min(1), active: z.boolean().optional() });

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
      data: { message: body.message, active: body.active ?? true },
    });
    await logAudit(user.email, "create", "announcement", announcement.id, announcement.message);
    return NextResponse.json(announcement, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
