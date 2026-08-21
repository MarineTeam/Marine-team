import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { errorResponse } from "@/lib/api-guard";
import { MARK_COLORS } from "../route";

const updateSchema = z.object({
  note: z.string().max(5000).nullish(),
  color: z.enum(MARK_COLORS).optional(),
});

/**
 * Edit or remove one of your own marks.
 *
 * Both scope the write by `userId` as well as `id` rather than fetching the
 * row and comparing afterwards: an id belonging to someone else then simply
 * matches nothing, so it 404s exactly as a made-up id would, which keeps the
 * response from confirming that a given mark exists.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const body = updateSchema.parse(await request.json());

    const result = await prisma.readingMark.updateMany({
      where: { id, userId: user.id },
      data: {
        ...(body.note !== undefined ? { note: body.note ?? null } : {}),
        ...(body.color !== undefined ? { color: body.color } : {}),
      },
    });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const result = await prisma.readingMark.deleteMany({ where: { id, userId: user.id } });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
