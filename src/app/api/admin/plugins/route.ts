import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { ensurePluginsSeeded } from "@/lib/plugins";

export async function GET() {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_plugins");
    await ensurePluginsSeeded();
    const plugins = await prisma.plugin.findMany({
      orderBy: { name: "asc" },
      include: { overrides: { include: { category: true } } },
    });
    return NextResponse.json(plugins);
  } catch (error) {
    return errorResponse(error);
  }
}
