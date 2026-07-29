import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureSeriesAccess } from "@/lib/permissions";
import { saveDraft, getDraft, discardDraft } from "@/lib/drafts";
import { updateSchema } from "@/app/api/admin/series/[id]/route";

/** The pending (unpublished) set of field edits for this series, if any. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const series = await prisma.series.findUniqueOrThrow({ where: { id } });
    await ensureSeriesAccess(user, series);
    const draft = await getDraft("series", id);
    return NextResponse.json(draft);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Stages a set of field edits without touching the live series row. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const series = await prisma.series.findUniqueOrThrow({ where: { id } });
    await ensureSeriesAccess(user, series);
    const body = updateSchema.parse(await request.json());
    const draft = await saveDraft("series", id, body);
    return NextResponse.json(draft);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    const { id } = await params;
    const series = await prisma.series.findUniqueOrThrow({ where: { id } });
    await ensureSeriesAccess(user, series);
    await discardDraft("series", id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
