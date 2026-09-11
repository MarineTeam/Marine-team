import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isPublicHttpUrl } from "@/lib/public-url";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  // A public address only: this server POSTs to it, and an address inside
  // whatever network the server sits on would make it call things for you.
  url: z.string().url().refine(isPublicHttpUrl, "The URL must be a public address."),
  secret: z.string().trim().max(200).optional(),
  active: z.boolean().optional(),
});

export async function GET() {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_plugins");
    const webhooks = await prisma.webhook.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json(webhooks);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_plugins");
    const body = schema.parse(await request.json());
    const webhook = await prisma.webhook.create({
      data: { url: body.url, secret: body.secret || null, active: body.active ?? true },
    });
    await logAudit(user.email, "create", "webhook", webhook.id, webhook.url);
    return NextResponse.json(webhook, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
