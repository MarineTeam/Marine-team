import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const schema = z.object({ categoryId: z.string().min(1), enabled: z.boolean() });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_plugins");
    const { slug } = await params;
    const { categoryId, enabled } = schema.parse(await request.json());
    const plugin = await prisma.plugin.findUniqueOrThrow({ where: { slug } });
    const override = await prisma.pluginCategoryOverride.upsert({
      where: { pluginId_categoryId: { pluginId: plugin.id, categoryId } },
      create: { pluginId: plugin.id, categoryId, enabled },
      update: { enabled },
      include: { category: true },
    });
    await logAudit(
      user.email,
      "set_plugin_override",
      "plugin",
      plugin.id,
      `${plugin.name} ${enabled ? "on" : "off"} for ${override.category.name}`,
    );
    return NextResponse.json(override, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
