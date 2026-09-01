import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { prisma } from "@/lib/db";
import { ensureCapability, ensureStaff } from "@/lib/permissions";

const patchSchema = z.object({
  label: z.string().trim().min(1).max(200).optional(),
  help: z.string().max(500).nullish(),
  required: z.boolean().optional(),
  options: z.string().max(4000).nullish(),
  position: z.number().int().min(0).max(500).optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ fieldId: string }> },
) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const { fieldId } = await context.params;
    const body = patchSchema.parse(await request.json());
    const field = await prisma.formField.update({ where: { id: fieldId }, data: body });
    return NextResponse.json(field);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Retires a question rather than deleting it.
 *
 * Every answer already given points at this row. Deleting it would take a
 * year of submissions' worth of answers with it — or, worse, leave them
 * orphaned under a column nobody can name. Retired, it simply stops being
 * asked, and the list can still say what somebody was answering.
 */
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ fieldId: string }> },
) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const { fieldId } = await context.params;
    await prisma.formField.update({ where: { id: fieldId }, data: { deletedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
