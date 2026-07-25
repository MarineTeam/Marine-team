import { prisma } from "@/lib/db";

export async function logAudit(
  actorEmail: string,
  action: string,
  entityType: string,
  entityId?: string | null,
  detail?: string | null,
) {
  await prisma.auditLog.create({
    data: { actorEmail, action, entityType, entityId: entityId ?? null, detail: detail ?? null },
  });
}
