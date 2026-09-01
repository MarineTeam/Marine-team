import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { logAudit } from "@/lib/audit";
import { progressOf } from "@/lib/broadcast";
import { prisma } from "@/lib/db";
import { ensureCapability, ensureStaff } from "@/lib/permissions";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_users");
    const { id } = await context.params;

    const broadcast = await prisma.broadcast.findUnique({ where: { id } });
    if (!broadcast) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const grouped = await prisma.broadcastRecipient.groupBy({
      by: ["status"],
      where: { broadcastId: id },
      _count: true,
    });
    const counts = { PENDING: 0, SENT: 0, FAILED: 0, SKIPPED: 0 };
    for (const row of grouped) counts[row.status] = row._count;

    // Failures are the only per-recipient detail worth loading: nobody reads
    // a list of four hundred successes, and everybody needs the six that
    // bounced.
    const failures = await prisma.broadcastRecipient.findMany({
      where: { broadcastId: id, status: "FAILED" },
      select: { name: true, address: true, channel: true, error: true },
      take: 100,
    });

    return NextResponse.json({ broadcast, counts, progress: progressOf(counts), failures });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Stopping one part-way. What has gone has gone; the rest doesn't. */
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_users");
    const { id } = await context.params;

    const broadcast = await prisma.broadcast.findUnique({ where: { id } });
    if (!broadcast) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (broadcast.status === "DRAFT") {
      await prisma.broadcast.delete({ where: { id } });
      await logAudit(user.email, "delete", "broadcast", id, broadcast.subject);
      return NextResponse.json({ ok: true, deleted: true });
    }

    await prisma.$transaction([
      prisma.broadcastRecipient.deleteMany({ where: { broadcastId: id, status: "PENDING" } }),
      prisma.broadcast.update({ where: { id }, data: { status: "CANCELLED" } }),
    ]);
    await logAudit(user.email, "update", "broadcast", id, "cancelled");
    return NextResponse.json({ ok: true, deleted: false });
  } catch (error) {
    return errorResponse(error);
  }
}
