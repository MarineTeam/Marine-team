import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { ensureHomeRowsSeeded } from "@/lib/content";

const createSchema = z.object({
  type: z.enum(["CATEGORY", "TAG"]),
  title: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  tag: z.string().optional().nullable(),
});

export async function GET() {
  try {
    await ensureStaff();
    await ensureHomeRowsSeeded();
    const rows = await prisma.homeRow.findMany({
      orderBy: { position: "asc" },
      include: { category: { select: { id: true, name: true } } },
    });
    return NextResponse.json(rows);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Only CATEGORY/TAG rows are creatable — the four built-in types are seeded once and only reordered/toggled, never duplicated. */
export async function POST(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_plugins");
    const body = createSchema.parse(await request.json());
    if (body.type === "CATEGORY" && !body.categoryId) {
      return NextResponse.json({ error: "categoryId is required for a CATEGORY row" }, { status: 400 });
    }
    if (body.type === "TAG" && !body.tag?.trim()) {
      return NextResponse.json({ error: "tag is required for a TAG row" }, { status: 400 });
    }
    const count = await prisma.homeRow.count();
    const row = await prisma.homeRow.create({
      data: {
        type: body.type,
        title: body.title || null,
        categoryId: body.type === "CATEGORY" ? body.categoryId : null,
        tag: body.type === "TAG" ? body.tag!.trim() : null,
        position: count,
      },
    });
    await logAudit(user.email, "create", "home-row", row.id, `${row.type}${row.tag ? `:${row.tag}` : ""}`);
    revalidateTag("home-rows", { expire: 0 });
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
