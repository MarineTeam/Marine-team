import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { isPluginEnabled } from "@/lib/plugins";

const schema = z.object({
  // Empty string clears the display name, falling back to the Auth0 name.
  displayName: z.string().trim().max(50).nullable(),
});

/** Sets the logged-in user's display name, shown instead of their Auth0 name wherever the Profiles plugin is on. */
export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!(await isPluginEnabled("profiles"))) {
    return NextResponse.json({ error: "Profiles are disabled" }, { status: 403 });
  }

  const { displayName } = schema.parse(await request.json());
  await prisma.user.update({
    where: { id: user.id },
    data: { displayName: displayName || null },
  });
  return NextResponse.json({ ok: true });
}
