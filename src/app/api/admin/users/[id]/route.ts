import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { grantEmailAccess, suspendEmailAccess } from "@/lib/authorization";
import { canChangeRole, canDeleteUser, canSetAuthorized, firstRefusal } from "@/lib/user-admin";

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

    // The target's current role decides what may be done to it, so it is read
    // before the write rather than inferred from the request. See
    // lib/user-admin.ts: `manage_users` grants ADMIN to nobody, and now takes
    // it from nobody either.
    const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const refusal = firstRefusal(
      canChangeRole(actor, target, body.role),
      canSetAuthorized(actor, target, body.authorized),
    );
    if (!refusal.ok) return NextResponse.json({ error: refusal.error }, { status: refusal.status });

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

    const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const refusal = canDeleteUser(actor, target);
    if (!refusal.ok) return NextResponse.json({ error: refusal.error }, { status: refusal.status });

    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
