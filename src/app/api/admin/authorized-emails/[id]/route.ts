import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api-guard";
import { ensureStaff, ensureCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

const patchSchema = z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]) });

/**
 * Suspends or reinstates an authorized email without losing the record of who
 * added it and when. Suspending takes effect on that member's next request —
 * see getCurrentUser, which re-checks the allowlist rather than trusting the
 * session cookie.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_users");

    const { id } = await params;
    const { status } = patchSchema.parse(await request.json());

    const row = await prisma.authorizedEmail.update({
      where: { id },
      data: { status },
      select: { id: true, email: true, status: true },
    });
    // Keep the member row in step immediately, so the fan-out queries that
    // read `authorized` don't keep including someone just suspended.
    if (status === "SUSPENDED") {
      await prisma.user.updateMany({ where: { email: row.email }, data: { authorized: false } });
    }

    await logAudit(user.email, status === "ACTIVE" ? "authorize" : "suspend", "email", row.id, row.email);
    return NextResponse.json(row);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Removes an email from the allowlist entirely. The member loses access on
 * their next request; their account and content are left alone, since being
 * un-authorized is not the same as being deleted.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_users");

    const { id } = await params;
    const row = await prisma.authorizedEmail.findUnique({ where: { id }, select: { id: true, email: true } });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Refuse to remove the last way in. Without this an administrator can
    // lock the entire organization out of its own admin area, recoverable
    // only by editing the database by hand.
    const activeCount = await prisma.authorizedEmail.count({ where: { status: "ACTIVE" } });
    const isSelf = row.email === user.email;
    if (isSelf && activeCount <= 1) {
      return NextResponse.json(
        { error: "This is the last authorized email — add another before removing your own." },
        { status: 409 },
      );
    }

    await prisma.$transaction([
      prisma.authorizedEmail.delete({ where: { id } }),
      prisma.user.updateMany({ where: { email: row.email }, data: { authorized: false } }),
    ]);

    await logAudit(user.email, "revoke", "email", row.id, row.email);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
