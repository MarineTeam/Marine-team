import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { isPluginEnabled } from "@/lib/plugins";
import { taxYearOf } from "@/lib/giving";
import { requireGivingAccess, statements } from "@/lib/giving-query";

/** Every household's statement for a year. */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("giving"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await requireGivingAccess();
    const asked = Number(new URL(request.url).searchParams.get("taxYear"));
    const taxYear = Number.isFinite(asked) && asked > 2000 ? asked : taxYearOf(new Date()) - 1;
    return NextResponse.json(
      { taxYear, statements: await statements(taxYear) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
