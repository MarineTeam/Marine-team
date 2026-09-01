import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { ensureCapability, ensureStaff } from "@/lib/permissions";
import { slugify } from "@/lib/slug";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  slug: z.string().trim().max(80).optional(),
  description: z.string().max(5000).nullish(),
  confirmation: z.string().max(2000).nullish(),
  notifyEmails: z.string().max(1000).nullish(),
  published: z.boolean().optional(),
  memberOnly: z.boolean().optional(),
  multiple: z.boolean().optional(),
});

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const { id } = await context.params;
    const form = await prisma.form.findUnique({
      where: { id },
      // Retired questions come too: a submission from March answered them,
      // and the list has to be able to name its own columns.
      include: { fields: { orderBy: { position: "asc" } } },
    });
    if (!form) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ form });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const { id } = await context.params;
    const body = patchSchema.parse(await request.json());
    const form = await prisma.form.update({
      where: { id },
      data: { ...body, slug: body.slug ? slugify(body.slug) || undefined : undefined },
    });
    await logAudit(user.email, "update", "form", form.id, form.title);
    return NextResponse.json({ form });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const { id } = await context.params;
    const form = await prisma.form.delete({ where: { id } });
    await logAudit(user.email, "delete", "form", form.id, form.title);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
