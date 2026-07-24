import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureAdmin, errorResponse } from "@/lib/api-guard";
import { getTargetDb } from "@/lib/admin-target";

const categorySchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, and hyphens"),
  position: z.number().int().optional(),
});

export async function GET(request: NextRequest) {
  try {
    await ensureAdmin();
    const prisma = getTargetDb(request);
    const categories = await prisma.category.findMany({ orderBy: { position: "asc" } });
    return NextResponse.json(categories);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureAdmin();
    const prisma = getTargetDb(request);
    const body = categorySchema.parse(await request.json());
    const category = await prisma.category.create({ data: body });
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
