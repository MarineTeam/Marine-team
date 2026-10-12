import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { isIsoDate } from "@/lib/dates";
import { myClaims, recordExpense, requireClaimant } from "@/lib/expenses-query";
import { isPluginEnabled } from "@/lib/plugins";

/**
 * A volunteer's own claims.
 *
 * Needs no capability beyond being signed in. Being out of pocket is not a
 * staff privilege, and somebody who cannot see whether their £8 has been paid
 * stops claiming and quietly subsidises the church instead.
 *
 * The claimant is taken from the session, so a claim cannot be filed in
 * somebody else's name — which would be the way round the self-approval rule.
 */
export const dynamic = "force-dynamic";

const schema = z.object({
  categoryId: z.string().min(1).max(60),
  amount: z.number().int().positive().max(1_000_000_00),
  payee: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(500),
  incurredOn: z.string().refine(isIsoDate, "Not a date"),
  receiptRef: z.string().trim().max(120).optional(),
});

export async function GET() {
  try {
    if (!(await isPluginEnabled("expenses"))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const user = await requireClaimant();
    return NextResponse.json(
      { claims: await myClaims(user.id) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("expenses"))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const user = await requireClaimant();
    const input = schema.parse(await request.json());

    // claimantId from the session: filing in somebody else's name would be the
    // way round the rule that nobody approves their own.
    const row = await recordExpense({ ...input, claimantId: user.id }, user);
    return NextResponse.json({ expense: row }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
