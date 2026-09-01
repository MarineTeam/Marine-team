import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { nextFormSlug } from "@/lib/forms-query";
import { ensureCapability, ensureStaff } from "@/lib/permissions";

const createSchema = z.object({ title: z.string().trim().min(1).max(200) });

export async function GET() {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const forms = await prisma.form.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { submissions: true } },
        fields: { where: { deletedAt: null }, select: { id: true } },
      },
    });
    return NextResponse.json({
      forms: forms.map(({ _count, fields, ...form }) => ({
        ...form,
        submissions: _count.submissions,
        questions: fields.length,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const { title } = createSchema.parse(await request.json());
    const form = await prisma.form.create({
      data: { title, slug: await nextFormSlug(title) },
    });
    await logAudit(user.email, "create", "form", form.id, form.title);
    return NextResponse.json(form, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
