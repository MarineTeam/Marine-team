import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { grantEmailAccess } from "@/lib/authorization";

const createSchema = z.object({
  email: z.string().email(),
  role: z.enum(["MEMBER", "ADMIN"]).optional(),
});

export async function GET() {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_users");
    const users = await prisma.user.findMany({
      orderBy: [{ authorized: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(users);
  } catch (error) {
    return errorResponse(error);
  }
}

/** Pre-authorizes an email to log in. The row is a placeholder (no auth0Id) until they first sign in. */
export async function POST(request: NextRequest) {
  try {
    const actor = await ensureStaff();
    await ensureCapability(actor, "manage_users");
    const body = createSchema.parse(await request.json());
    if (body.role === "ADMIN" && actor.role !== "ADMIN") {
      return NextResponse.json({ error: "Only a site admin can grant the Admin role" }, { status: 403 });
    }
    const email = body.email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "That email already has a row" }, { status: 409 });
    }

    const user = await prisma.user.create({
      data: { email, role: body.role ?? "MEMBER", authorized: true },
    });
    // The allowlist is what getCurrentUser() actually reads; setting
    // `authorized` alone would be undone on this person's first request.
    await grantEmailAccess({
      email,
      actorId: actor.id,
      actorEmail: actor.email,
      note: "Pre-authorized from Access",
    });
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
