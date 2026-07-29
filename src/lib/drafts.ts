import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/** One pending set of field edits for an entity, upserted (not versioned). */
export async function saveDraft(entityType: string, entityId: string, data: Prisma.InputJsonValue) {
  return prisma.draftRevision.upsert({
    where: { entityType_entityId: { entityType, entityId } },
    create: { entityType, entityId, data },
    update: { data },
  });
}

export async function getDraft(entityType: string, entityId: string) {
  return prisma.draftRevision.findUnique({ where: { entityType_entityId: { entityType, entityId } } });
}

export async function discardDraft(entityType: string, entityId: string) {
  await prisma.draftRevision.deleteMany({ where: { entityType, entityId } });
}
