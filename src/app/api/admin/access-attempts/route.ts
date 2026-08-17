import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { normalizeEmail, pruneAccessAttempts } from "@/lib/authorization";

const PAGE_SIZE = 25;

const actionSchema = z.object({
  action: z.enum(["review", "prune"]),
  id: z.string().optional(),
  /** For "prune": drop anything older than this many days. */
  retentionDays: z.number().int().min(1).max(3650).optional(),
});

/**
 * Refused login/signup/session attempts, paginated and filterable.
 *
 * Gated on `view_audit_log`: this is the same kind of information as the audit
 * trail — who tried to do what — and reusing that capability avoids inventing
 * a second idea of who may read security history.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "view_audit_log");

    const params = request.nextUrl.searchParams;
    const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
    const email = params.get("email")?.trim();
    const provider = params.get("provider")?.trim();
    const reason = params.get("reason")?.trim();
    const since = params.get("since")?.trim();

    // Every filter goes through Prisma's query builder; nothing here is
    // concatenated into SQL, and the enum-typed filters are validated by
    // Prisma against the schema rather than trusted as strings.
    const where: Prisma.UnauthorizedAccessAttemptWhereInput = {
      ...(email ? { email: { contains: normalizeEmail(email) } } : {}),
      ...(provider ? { provider } : {}),
      ...(reason && isReason(reason) ? { reason } : {}),
      ...(since && !Number.isNaN(Date.parse(since)) ? { createdAt: { gte: new Date(since) } } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.unauthorizedAccessAttempt.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.unauthorizedAccessAttempt.count({ where }),
    ]);

    return NextResponse.json({ rows, total, page, pageSize: PAGE_SIZE });
  } catch (error) {
    return errorResponse(error);
  }
}

const REASONS = [
  "NOT_ORG_MEMBER",
  "EMAIL_NOT_AUTHORIZED",
  "NOT_ORG_MEMBER_AND_EMAIL_NOT_AUTHORIZED",
  "AUTH0_CALLBACK_ERROR",
] as const;

function isReason(value: string): value is (typeof REASONS)[number] {
  return (REASONS as readonly string[]).includes(value);
}

/** Marks one attempt reviewed, or prunes old records past a retention window. */
export async function POST(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "view_audit_log");

    const body = actionSchema.parse(await request.json());

    if (body.action === "review") {
      if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
      await prisma.unauthorizedAccessAttempt.update({
        where: { id: body.id },
        data: { reviewedAt: new Date(), reviewedByEmail: user.email },
      });
      return NextResponse.json({ ok: true });
    }

    const deleted = await pruneAccessAttempts(body.retentionDays);
    await logAudit(user.email, "prune", "access-attempts", null, `${deleted} records`);
    return NextResponse.json({ ok: true, deleted });
  } catch (error) {
    return errorResponse(error);
  }
}
