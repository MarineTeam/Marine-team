import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { ensurePluginsSeeded, PLUGIN_META } from "@/lib/plugins";

export async function GET() {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_plugins");
    await ensurePluginsSeeded();
    const plugins = await prisma.plugin.findMany({
      // Scoped to PLUGIN_META's own slugs — the Plugin table also holds the
      // Query Monitor admin switch (see src/lib/query-monitor.ts), which
      // isn't a content feature and has no per-category meaning, so it
      // shouldn't show up here with a "Category overrides" control.
      where: { slug: { in: PLUGIN_META.map((meta) => meta.slug) } },
      orderBy: { name: "asc" },
      include: { overrides: { include: { category: true } } },
    });
    return NextResponse.json(plugins);
  } catch (error) {
    return errorResponse(error);
  }
}
