import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { prisma } from "@/lib/db";
import { ensureCapability, ensureStaff } from "@/lib/permissions";

const FIELD_TYPES = [
  "TEXT",
  "TEXTAREA",
  "EMAIL",
  "PHONE",
  "NUMBER",
  "DATE",
  "SELECT",
  "RADIO",
  "CHECKBOX",
  "CHECKBOXES",
] as const;

const createSchema = z.object({
  label: z.string().trim().min(1).max(200),
  type: z.enum(FIELD_TYPES).default("TEXT"),
});

/** Adds a question, at the end. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_events");
    const { id } = await context.params;
    const body = createSchema.parse(await request.json());

    // Position counts every field, retired ones included, so a new question
    // can't land on top of a retired one and reorder the export's columns.
    const last = await prisma.formField.findFirst({
      where: { formId: id },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const field = await prisma.formField.create({
      data: { formId: id, label: body.label, type: body.type, position: (last?.position ?? -1) + 1 },
    });
    return NextResponse.json(field, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
