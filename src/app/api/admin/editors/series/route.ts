import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureAdmin, errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  userEmail: z.string().email(),
  seriesId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const admin = await ensureAdmin();
    const body = schema.parse(await request.json());
    const user = await prisma.user.findUnique({ where: { email: body.userEmail.toLowerCase() } });
    if (!user) {
      return NextResponse.json({ error: "No user with that email has logged in yet" }, { status: 404 });
    }
    const editor = await prisma.seriesEditor.create({
      data: { userId: user.id, seriesId: body.seriesId },
      include: { user: true, series: true },
    });
    await logAudit(admin.email, "grant_series_editor", "series", body.seriesId, user.email);
    return NextResponse.json(editor, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
