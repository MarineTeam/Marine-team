import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureAdmin, errorResponse } from "@/lib/api-guard";

const categorySchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, and hyphens"),
  parentId: z.string().optional().nullable(),
  position: z.number().int().optional(),
});

export async function GET() {
  try {
    await ensureAdmin();
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
    await ensureAdmin();
    const body = categorySchema.parse(await request.json());
    const category = await prisma.category.create({ data: body });
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
