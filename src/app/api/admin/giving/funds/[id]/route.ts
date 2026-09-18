import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { isPluginEnabled } from "@/lib/plugins";
import { requireGivingAccess, updateFund } from "@/lib/giving-query";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(500).nullish(),
  active: z.boolean().optional(),
  taxDeductible: z.boolean().optional(),
  position: z.number().int().min(0).max(999).optional(),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isPluginEnabled("giving"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const user = await requireGivingAccess();
    const { id } = await context.params;
    const fund = await updateFund(id, schema.parse(await request.json()));
    await logAudit(user.email, "update", "giving-fund", id, fund.name);
    return NextResponse.json(fund);
  } catch (error) {
    return errorResponse(error);
  }
}
