import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const updateSchema = z.object({
  title: z.string().optional().nullable(),
  enabled: z.boolean().optional(),
  position: z.number().int().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_plugins");
    const { id } = await params;
    const body = updateSchema.parse(await request.json());
    const row = await prisma.homeRow.update({
      where: { id },
      data: { ...body, title: body.title === undefined ? undefined : body.title || null },
    });
    await logAudit(user.email, "update", "home-row", row.id, JSON.stringify(body));
    revalidateTag("home-rows", { expire: 0 });
    return NextResponse.json(row);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Only CATEGORY/TAG rows can be deleted — the four built-in row types can only be disabled, since the homepage's built-in sections are hardcoded to them. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_plugins");
    const { id } = await params;
    const row = await prisma.homeRow.findUniqueOrThrow({ where: { id } });
    if (row.type !== "CATEGORY" && row.type !== "TAG") {
      return NextResponse.json({ error: "Built-in rows can only be disabled, not deleted" }, { status: 400 });
    }
    await prisma.homeRow.delete({ where: { id } });
    await logAudit(user.email, "delete", "home-row", id, `${row.type}${row.tag ? `:${row.tag}` : ""}`);
    revalidateTag("home-rows", { expire: 0 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
