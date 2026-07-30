import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { QUERY_MONITOR_ADMIN_SLUG } from "@/lib/query-monitor";

const schema = z.object({ enabled: z.boolean() });

export async function PATCH(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_plugins");
    const { enabled } = schema.parse(await request.json());
    const row = await prisma.plugin.upsert({
      where: { slug: QUERY_MONITOR_ADMIN_SLUG },
      create: {
        slug: QUERY_MONITOR_ADMIN_SLUG,
        name: "Query Monitor",
        description: "Admin on/off switch for the Query Monitor debug bar (also requires QUERY_MONITOR_ENABLED=true).",
        enabled,
      },
      update: { enabled },
    });
    await logAudit(user.email, enabled ? "enable_query_monitor" : "disable_query_monitor", "plugin", row.id, row.name);
    return NextResponse.json({ enabled: row.enabled });
  } catch (error) {
    return errorResponse(error);
  }
}
