import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const categorySchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, and hyphens"),
  parentId: z.string().optional().nullable(),
  position: z.number().int().optional(),
  pinned: z.boolean().optional(),
});

export async function GET() {
  try {
    await ensureStaff();
    const categories = await prisma.category.findMany({
      orderBy: { position: "asc" },
      include: { parent: true },
    });
    return NextResponse.json(categories);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_categories");
    const body = categorySchema.parse(await request.json());
    const category = await prisma.category.create({ data: body });
    await logAudit(user.email, "create", "category", category.id, category.name);
    revalidateTag("categories", { expire: 0 });
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
