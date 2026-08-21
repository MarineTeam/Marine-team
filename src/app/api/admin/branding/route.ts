import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { DEFAULT_BRANDING, isHexColor, normalizeBranding, normalizeHex } from "@/lib/branding";

const hex = z.string().refine(isHexColor, "Must be a hex colour like #1a8fd1").transform(normalizeHex);

const updateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  shortName: z.string().trim().min(1).max(60),
  brand: hex,
  brandDeep: hex,
  brandLight: hex,
  // Same-origin paths and https only, matching normalizeBranding: this URL is
  // rendered into every page, so a `javascript:` or plain-http source would be
  // a problem on every page.
  logoUrl: z
    .string()
    .trim()
    .refine((value) => value === "" || value.startsWith("/") || value.startsWith("https://"), {
      message: "Must be a path beginning with / or an https:// URL",
    })
    .nullable()
    .optional(),
});

export async function GET() {
  try {
    await ensureStaff();
    const row = await prisma.brandSettings.upsert({
      where: { id: "singleton" },
      create: {},
      update: {},
    });
    return NextResponse.json(normalizeBranding(row));
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Branding is site-wide by nature — there is no per-category skin — so it sits
 * behind the same site-wide grant as the other global switches.
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_plugins");
    const body = updateSchema.parse(await request.json());
    const logoUrl = body.logoUrl ? body.logoUrl : null;

    const row = await prisma.brandSettings.upsert({
      where: { id: "singleton" },
      create: { ...body, logoUrl },
      update: { ...body, logoUrl },
    });

    await logAudit(user.email, "update", "branding", row.id, body.name);
    // Every page reads branding, and the cached copy is what they read.
    revalidateTag("branding", { expire: 0 });
    return NextResponse.json(normalizeBranding(row));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Puts the palette and name back to what the app ships with. */
export async function DELETE() {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_plugins");
    const row = await prisma.brandSettings.upsert({
      where: { id: "singleton" },
      create: {},
      update: { ...DEFAULT_BRANDING },
    });
    await logAudit(user.email, "reset", "branding", row.id, DEFAULT_BRANDING.name);
    revalidateTag("branding", { expire: 0 });
    return NextResponse.json(normalizeBranding(row));
  } catch (error) {
    return errorResponse(error);
  }
}
