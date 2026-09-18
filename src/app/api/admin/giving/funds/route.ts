import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { isPluginEnabled } from "@/lib/plugins";
import { createFund, listFunds, requireGivingAccess } from "@/lib/giving-query";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).nullish(),
  taxDeductible: z.boolean().optional(),
});

export async function GET() {
  try {
    if (!(await isPluginEnabled("giving"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await requireGivingAccess();
    return NextResponse.json({ funds: await listFunds() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("giving"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const user = await requireGivingAccess();
    const fund = await createFund(schema.parse(await request.json()));
    await logAudit(user.email, "create", "giving-fund", fund.id, fund.name);
    return NextResponse.json(fund, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
