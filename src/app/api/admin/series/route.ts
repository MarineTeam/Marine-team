import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureAdmin, errorResponse } from "@/lib/api-guard";

const seriesSchema = z.object({
  title: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, and hyphens"),
  description: z.string().optional(),
  coverImageUrl: z.string().url().optional().or(z.literal("")),
  categoryId: z.string().optional().nullable(),
  memberOnly: z.boolean().optional(),
  published: z.boolean().optional(),
  position: z.number().int().optional(),
});

export async function GET() {
  try {
    await ensureAdmin();
    const series = await prisma.series.findMany({
      orderBy: { position: "asc" },
      include: { category: true, _count: { select: { videos: true, files: true } } },
    });
    return NextResponse.json(series);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureAdmin();
    const body = seriesSchema.parse(await request.json());
    const series = await prisma.series.create({ data: body });
    return NextResponse.json(series, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
