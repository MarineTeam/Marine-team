import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import { addIsoDays, isIsoDate, todayIso } from "@/lib/dates";
import { claimSchedule, DEFAULT_REVIEW_DAYS } from "@/lib/gift-aid";
import { assessSpan, requireGivingAccess } from "@/lib/gift-aid-query";
import { isPluginEnabled } from "@/lib/plugins";
import { logRead } from "@/lib/read-audit-query";

/**
 * The claim schedule, as a file to hand to HMRC's spreadsheet.
 *
 * One line per donor with their aggregated total, which is the shape HMRC's own
 * form takes — not a line per donation. The aggregation happens in
 * `claimSchedule`, the same function the screen uses, so the file and the figure
 * the treasurer saw are the same arithmetic rather than two implementations that
 * agree until they don't.
 *
 * Read-audited, and more pointedly than the screen: this is a list of named
 * donors, their home addresses and what they gave, leaving the building as a
 * file.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("giving"))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const user = await requireGivingAccess();

    const params = request.nextUrl.searchParams;
    const today = todayIso();
    const fromParam = params.get("from");
    const toParam = params.get("to");
    const from = fromParam && isIsoDate(fromParam) ? fromParam : addIsoDays(today, -DEFAULT_REVIEW_DAYS);
    const to = toParam && isIsoDate(toParam) ? toParam : today;

    await logRead({ kind: "gift_aid_declarations", actorEmail: user.email });
    await logAudit(user.email, "export", "gift-aid-schedule", null, `${from} to ${to}`);

    const rows = claimSchedule(await assessSpan(from, to, today));
    const csv = toCsv(
      rows.map((row) => ({
        Title: row.title,
        "First name": row.firstName,
        "Last name": row.lastName,
        "House name or number": row.houseNumber,
        Postcode: row.postcode,
        "Aggregated donations": "",
        "Sponsored event": "",
        "Donation date": row.donationDate,
        Amount: row.amount,
      })),
    );

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="gift-aid-${from}-to-${to}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
