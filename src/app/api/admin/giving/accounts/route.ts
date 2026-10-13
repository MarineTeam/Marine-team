import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toCsv } from "@/lib/accounts";
import { annualAccounts, yearsWithActivity } from "@/lib/accounts-query";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { isIsoDate, type IsoDate } from "@/lib/dates";
import { requireGivingAccess } from "@/lib/giving-query";
import { toCsv as holdingsCsv } from "@/lib/holdings";
import { listHoldings, recordHolding, removeHolding, statement } from "@/lib/holdings-query";
import { isPluginEnabled } from "@/lib/plugins";

/**
 * The annual statement.
 *
 * Read-only: a statement is a view over rows that were written elsewhere, and
 * giving it a POST would invite somebody to "adjust" a figure rather than
 * correct the entry it came from.
 *
 * `format=csv` returns the same figures as a download, because an examiner
 * asks for something they can open and a church that cannot produce one types
 * them out again by hand.
 *
 * Not read-audited, deliberately. The read log covers screens that identify a
 * person, and this one names nobody: every figure on it is a total. A log that
 * grows to cover everything is a log nobody reads.
 */
export const dynamic = "force-dynamic";

const MIN_YEAR = 1900;
const MAX_YEAR = 2200;

export async function GET(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("giving"))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await requireGivingAccess();

    const params = request.nextUrl.searchParams;
    const asked = Number(params.get("year"));
    const startMonth = clamp(Number(params.get("startMonth")), 1, 12, 1);
    const startDay = clamp(Number(params.get("startDay")), 1, 31, 1);

    const years = await yearsWithActivity(startMonth, startDay);
    const year = Number.isInteger(asked) && asked >= MIN_YEAR && asked <= MAX_YEAR ? asked : years[0];

    const accounts = await annualAccounts(year, startMonth, startDay);
    const held = await statement(year, startMonth, startDay);

    if (params.get("format") === "csv") {
      if (params.get("of") === "holdings") {
        return new NextResponse(holdingsCsv(held), {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="assets-and-liabilities-${held.label}.csv"`,
            "Cache-Control": "private, no-store",
          },
        });
      }
      return new NextResponse(toCsv(accounts), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="receipts-and-payments-${accounts.label}.csv"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    return NextResponse.json(
      { accounts, held, holdings: await listHoldings(), years, year },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** A query string is whatever somebody typed; out-of-range falls back rather than throwing. */
function clamp(value: number, low: number, high: number, fallback: number): number {
  if (!Number.isInteger(value) || value < low || value > high) return fallback;
  return value;
}

const holdingSchema = z.union([
  z.object({
    action: z.literal("holding"),
    name: z.string().trim().min(1).max(120),
    kind: z.enum(["ASSET", "LIABILITY"]),
    amount: z.number().int().positive().max(1_000_000_000_0),
    asAt: z.custom<IsoDate>((value) => typeof value === "string" && isIsoDate(value), "Not a date"),
    fundId: z.string().min(1).max(60).nullish(),
    note: z.string().trim().max(500).nullish(),
  }),
  z.object({ action: z.literal("forget"), id: z.string().min(1).max(60) }),
]);

/** Only the hand-entered holdings. Everything else here is derived. */
export async function POST(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("giving"))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const user = await requireGivingAccess();
    const input = holdingSchema.parse(await request.json());

    if (input.action === "forget") {
      await removeHolding(input.id);
      await logAudit(user.email, "delete", "holding", input.id, "");
      return NextResponse.json({ ok: true });
    }

    const row = await recordHolding(input, user);
    await logAudit(user.email, "record", "holding", row.id, `${input.name} at ${input.asAt}`);
    return NextResponse.json({ holding: row }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
