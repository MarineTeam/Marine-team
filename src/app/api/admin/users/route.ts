import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureAdmin, errorResponse } from "@/lib/api-guard";

const createSchema = z.object({
  email: z.string().email(),
  role: z.enum(["MEMBER", "ADMIN"]).optional(),
});

export async function GET() {
  try {
    await ensureAdmin();
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
    await ensureAdmin();
    const body = createSchema.parse(await request.json());
    const email = body.email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "That email already has a row" }, { status: 409 });
    }

    const user = await prisma.user.create({
      data: { email, role: body.role ?? "MEMBER", authorized: true },
    });
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
