import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { CLEARANCE_KINDS } from "@/lib/clearance";
import {
  expiring,
  recordClearance,
  register,
  requireSafeguarding,
  safeguardingSettings,
  withdrawClearance,
  withdrawalReason,
} from "@/lib/clearance-query";
import { isIsoDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { isPluginEnabled } from "@/lib/plugins";
import { logRead } from "@/lib/read-audit-query";

/**
 * The safeguarding register.
 *
 * Everything here is behind `manage_people` — the same grant as the household
 * records, and deliberately not the one that keeps the rota. Whoever schedules
 * a service is told yes or no when they try to put somebody on; they are not
 * shown the register that produced the answer.
 *
 * The one thing this route will not do in bulk is hand out a withdrawal
 * reason. It is asked for one record at a time, by id, so the reason somebody
 * was stood down is never on a screen that was opened to look at something
 * else.
 */
export const dynamic = "force-dynamic";

const isoDate = z.string().refine(isIsoDate, "Not a date");

const entrySchema = z.object({
  userId: z.string().min(1).max(60),
  kind: z.enum(CLEARANCE_KINDS),
  verifiedOn: isoDate,
  expiresOn: isoDate,
  /** The church's own filing reference — never a disclosure number. */
  reference: z.string().trim().max(120).optional(),
});

const withdrawSchema = z.object({
  clearanceId: z.string().min(1).max(60),
  reason: z.string().trim().min(1).max(500),
});

const settingsSchema = z.object({
  checkinDeskRequires: z.array(z.enum(CLEARANCE_KINDS)),
  warnDays: z.number().int().min(7).max(365),
});

async function guard() {
  if (!(await isPluginEnabled("safeguarding"))) return null;
  return requireSafeguarding();
}

export async function GET(request: NextRequest) {
  try {
    const user = await guard();
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // One record's withdrawal reason, asked for on purpose.
    const reasonFor = request.nextUrl.searchParams.get("reasonFor");
    if (reasonFor) {
      // Now recorded in both places on purpose: the write log keeps the
      // long-lived trail, and the read log is where somebody asking "who has
      // been through this person's file" will actually look.
      await logAudit(user.email, "view", "clearance-reason", reasonFor, "withdrawal reason");
      await logRead({ kind: "withdrawal_reason", actorEmail: user.email, subjectId: reasonFor });
      return NextResponse.json({ reason: await withdrawalReason(reasonFor) });
    }

    await logRead({ kind: "safeguarding_register", actorEmail: user.email });
    const [people, chases, settings] = await Promise.all([
      register(),
      expiring(),
      safeguardingSettings(),
    ]);
    return NextResponse.json({ people, expiring: chases, settings });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await guard();
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = entrySchema.parse(await request.json());
    const row = await recordClearance(body, user);
    await logAudit(user.email, "create", "clearance", row.id, `${body.kind} to ${body.expiresOn}`);
    return NextResponse.json({ clearance: { id: row.id } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await guard();
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const payload = await request.json();

    if (payload && typeof payload === "object" && "clearanceId" in payload) {
      const body = withdrawSchema.parse(payload);
      const row = await withdrawClearance(body.clearanceId, body.reason);
      // The reason is in the row, not in the audit line: the audit log has a
      // wider readership than this register does.
      await logAudit(user.email, "withdraw", "clearance", row.id, row.kind);
      return NextResponse.json({ ok: true });
    }

    const settings = settingsSchema.parse(payload);
    await prisma.safeguardingSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...settings },
      update: settings,
    });
    await logAudit(
      user.email,
      "edit",
      "safeguarding-settings",
      "singleton",
      `desk requires ${settings.checkinDeskRequires.join(", ") || "nothing"}`,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
