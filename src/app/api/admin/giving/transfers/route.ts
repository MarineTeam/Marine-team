import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { isIsoDate } from "@/lib/dates";
import { recordTransfer } from "@/lib/funds-query";
import { requireGivingAccess } from "@/lib/giving-query";
import { isPluginEnabled } from "@/lib/plugins";

/**
 * Moving money between funds.
 *
 * There is no PATCH and no DELETE, deliberately. A transfer entered in error
 * is corrected by a transfer the other way, which leaves both entries and the
 * reason for each on the record — editing one would quietly rewrite the
 * explanation of why a restricted fund got smaller, which is the single thing
 * anybody will want to read back.
 */
export const dynamic = "force-dynamic";

const schema = z.object({
  fromFundId: z.string().min(1).max(60),
  toFundId: z.string().min(1).max(60),
  amount: z.number().int().positive().max(1_000_000_000),
  movedOn: z.string().refine(isIsoDate, "Not a date").optional(),
  authority: z.string().trim().min(1).max(300),
  note: z.string().trim().max(500).nullish(),
});

export async function POST(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("giving"))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const user = await requireGivingAccess();
    const input = schema.parse(await request.json());
    const transfer = await recordTransfer(input, user);
    await logAudit(
      user.email,
      "transfer",
      "giving-fund",
      input.fromFundId,
      `${input.amount}p to ${input.toFundId}: ${input.authority}`,
    );
    return NextResponse.json({ transfer }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
