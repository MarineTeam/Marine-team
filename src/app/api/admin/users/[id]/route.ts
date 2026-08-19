import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { grantEmailAccess, suspendEmailAccess } from "@/lib/authorization";

const updateSchema = z.object({
  role: z.enum(["MEMBER", "ADMIN"]).optional(),
  authorized: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await ensureStaff();
    await ensureCapability(actor, "manage_users");
    const { id } = await params;
    const body = updateSchema.parse(await request.json());
    if (id === actor.id && body.authorized === false) {
      return NextResponse.json(
        { error: "You can't revoke your own access" },
        { status: 400 },
      );
    }
    if (body.role === "ADMIN" && actor.role !== "ADMIN") {
      return NextResponse.json({ error: "Only a site admin can grant the Admin role" }, { status: 403 });
    }
    const user = await prisma.user.update({
      where: { id },
      data: { role: body.role, authorized: body.authorized },
    });

    // Access itself lives in AuthorizedEmail — getCurrentUser() recomputes
    // `User.authorized` from it on every request, so toggling the flag here
    // without also moving the allowlist entry would be silently reverted the
    // next time this person loaded a page.
    if (body.authorized === true) {
      await grantEmailAccess({
        email: user.email,
        actorId: actor.id,
        actorEmail: actor.email,
        note: "Granted from Access",
      });
    } else if (body.authorized === false) {
      await suspendEmailAccess(user.email);
    }

    return NextResponse.json(user);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await ensureStaff();
    await ensureCapability(actor, "manage_users");
    const { id } = await params;
    if (id === actor.id) {
      return NextResponse.json(
        { error: "You can't remove your own access" },
        { status: 400 },
      );
    }
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
