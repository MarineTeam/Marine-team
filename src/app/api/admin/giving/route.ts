import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { isPluginEnabled } from "@/lib/plugins";
import { parseMoney, taxYearOf, taxYearRange } from "@/lib/giving";
import { listFunds, listGifts, recordManualGift, requireGivingAccess, summary } from "@/lib/giving-query";

/** What came in, and adding what didn't come through the payment page. */
export const dynamic = "force-dynamic";

const manualSchema = z.object({
  amount: z.string().min(1).max(20),
  fundId: z.string().min(1).max(60),
  source: z.enum(["CASH", "CHEQUE", "BANK_TRANSFER", "OTHER"]),
  givenAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Give a date as YYYY-MM-DD"),
  giverId: z.string().min(1).max(60).nullish(),
  note: z.string().max(500).nullish(),
});

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function GET(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("giving"))) return notFound();
    await requireGivingAccess();

    const url = new URL(request.url);
    const year = Number(url.searchParams.get("taxYear") ?? taxYearOf(new Date()));
    const { from, to } = taxYearRange(Number.isFinite(year) ? year : taxYearOf(new Date()));

    return NextResponse.json(
      {
        taxYear: Number.isFinite(year) ? year : taxYearOf(new Date()),
        summary: await summary(from, to),
        gifts: await listGifts({ from, to }),
        funds: await listFunds(),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("giving"))) return notFound();
    const user = await requireGivingAccess();
    const body = manualSchema.parse(await request.json());

    const amount = parseMoney(body.amount);
    if (amount === null) {
      return NextResponse.json({ error: "That doesn't look like an amount." }, { status: 400 });
    }

    const gift = await recordManualGift({
      amount,
      fundId: body.fundId,
      source: body.source,
      givenAt: new Date(`${body.givenAt}T12:00:00Z`),
      giverId: body.giverId ?? null,
      note: body.note ?? null,
      byEmail: user.email,
    });
    await logAudit(user.email, "create", "gift", gift.id, `${body.source} ${body.amount}`);
    return NextResponse.json(gift, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
