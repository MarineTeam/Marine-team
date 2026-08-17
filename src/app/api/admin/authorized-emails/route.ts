import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { isValidEmail, normalizeEmail } from "@/lib/authorization";

const createSchema = z.object({
  email: z.string().min(3).max(254),
  note: z.string().max(200).nullable().optional(),
});

/** Page size for the list; the admin UI pages rather than loading every row. */
const PAGE_SIZE = 50;

/**
 * The email allowlist — half of the security model (the other half being Auth0
 * organization membership). Gated on `manage_users`, the same capability that
 * already governs granting access at /admin/users, so this doesn't introduce a
 * second notion of who may hand out access.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_users");

    const search = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
    const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? 1) || 1);

    // `contains` goes through Prisma's parameterized query builder — the
    // search term is never concatenated into SQL.
    const where = search ? { email: { contains: search } } : {};
    const [rows, total] = await Promise.all([
      prisma.authorizedEmail.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        // Explicit select: no more of the row than the screen shows.
        select: {
          id: true,
          email: true,
          status: true,
          note: true,
          addedByEmail: true,
          createdAt: true,
        },
      }),
      prisma.authorizedEmail.count({ where }),
    ]);

    return NextResponse.json({ rows, total, page, pageSize: PAGE_SIZE });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_users");

    const body = createSchema.parse(await request.json());
    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "That doesn't look like an email address" }, { status: 400 });
    }

    // upsert rather than create-then-catch: two administrators adding the same
    // address at once is a race the unique index would otherwise turn into a
    // 500 for one of them. Re-adding an existing address is treated as
    // reinstating it, which is what an administrator means by it.
    const row = await prisma.authorizedEmail.upsert({
      where: { email },
      create: {
        email,
        note: body.note?.trim() || null,
        addedById: user.id,
        addedByEmail: user.email,
      },
      update: {
        status: "ACTIVE",
        ...(body.note?.trim() ? { note: body.note.trim() } : {}),
      },
      select: { id: true, email: true, status: true, note: true, addedByEmail: true, createdAt: true },
    });

    await logAudit(user.email, "authorize", "email", row.id, email);
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
