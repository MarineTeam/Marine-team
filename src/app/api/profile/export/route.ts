import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { rateLimitResponse, windowStart } from "@/lib/rate-limit";
import { buildExport } from "@/lib/data-export-query";
import { assertExportSafe, exportFilename, totalRecords } from "@/lib/data-export";

/**
 * A member's own copy of everything the app holds about them, as one JSON file.
 *
 * The counterpart to DELETE on this route: leaving should not mean losing the
 * notes you took on four years of sermons, and "what do you actually have on
 * me?" deserves an answer that doesn't involve an admin running queries.
 *
 * Not behind a plugin. Every other member-facing feature here can be switched
 * off by an admin; this one is the answer to a question a member is entitled to
 * ask, so there is deliberately no switch for it.
 */
// Reads the session and the member's whole history: nothing here is static,
// and a build-time render would produce a file for nobody.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // ~30 queries across the member's whole history, so this is the most
    // expensive thing any logged-in member can ask for. Two a minute is
    // generous for a person pressing a button and useless as an amplifier.
    const limited = await rateLimitResponse(
      () =>
        prisma.auditLog.count({
          where: { actorEmail: user.email, action: "export", entityType: "account", createdAt: { gte: windowStart(60) } },
        }),
      2,
    );
    if (limited) return limited;

    const at = new Date();
    const doc = await buildExport(user, at);
    // Last line of defence before the bytes leave: throws rather than filters,
    // because a credential reaching this point means a query changed.
    assertExportSafe(doc);

    await logAudit(user.email, "export", "account", user.id, `member exported ${totalRecords(doc)} records`);

    return new NextResponse(JSON.stringify(doc, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename(user.email, at)}"`,
        // Nothing about this belongs in a shared cache, and a stale copy would
        // be worse than no copy — it would look like current data.
        "Cache-Control": "no-store, private",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
