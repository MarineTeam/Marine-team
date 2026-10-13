import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { toCsv } from "@/lib/accounts";
import { annualAccounts, yearsWithActivity } from "@/lib/accounts-query";
import { requireGivingAccess } from "@/lib/giving-query";
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

    if (params.get("format") === "csv") {
      return new NextResponse(toCsv(accounts), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="receipts-and-payments-${accounts.label}.csv"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    return NextResponse.json(
      { accounts, years, year },
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
