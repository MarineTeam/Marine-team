import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureAdmin, errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  userEmail: z.string().email(),
  categoryId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const admin = await ensureAdmin();
    const body = schema.parse(await request.json());
    const user = await prisma.user.findUnique({ where: { email: body.userEmail.toLowerCase() } });
    if (!user) {
      return NextResponse.json({ error: "No user with that email has logged in yet" }, { status: 404 });
    }
    const editor = await prisma.categoryEditor.create({
      data: { userId: user.id, categoryId: body.categoryId },
      include: { user: true, category: true },
    });
    await logAudit(admin.email, "grant_category_editor", "category", body.categoryId, user.email);
    return NextResponse.json(editor, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
