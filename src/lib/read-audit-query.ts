import { prisma } from "@/lib/db";
import {
  AUDITED_READ_KEYS,
  byActor,
  isNewLook,
  LOOK_WINDOW_SECONDS,
  looksAtSubject,
  retentionCutoff,
  type AuditedRead,
} from "@/lib/read-audit";

/**
 * Writing and reading the record of who looked.
 *
 * The rules are in `read-audit.ts`. Two things this file is responsible for.
 *
 * **A failed log never fails the read.** `logRead` swallows its own errors. An
 * oversight record is worth having and is not worth taking the giving page down
 * for — and a church whose treasurer cannot open the accounts because an index
 * is locked will have the logging removed by the end of the week, which is a
 * worse outcome than a missing row.
 *
 * **The log is not readable beside the writes.** It lives behind
 * `view_audit_log` like the rest of the audit trail, but in its own table and
 * its own view, because "who read this" and "who changed this" are asked by
 * different people for different reasons, and mixing them buries the rarer one.
 */

/**
 * Records that somebody looked at something, unless they already have.
 *
 * Two queries in the common case and one write on a genuinely new look. The
 * coalescing window makes that cheap: a person working through a screen for ten
 * minutes costs one insert, not one per request.
 */
export async function logRead(input: {
  kind: AuditedRead;
  actorEmail: string;
  subjectId?: string | null;
}): Promise<void> {
  try {
    // Guards against a caller passing a kind that is not on the list — the
    // column is text so the database will not, and a log with a typo'd kind is
    // a row that never turns up in the query somebody runs later.
    if (!AUDITED_READ_KEYS.includes(input.kind)) return;

    const since = new Date(Date.now() - LOOK_WINDOW_SECONDS * 1000);
    const recent = await prisma.dataAccessLog.findMany({
      where: { kind: input.kind, actorEmail: input.actorEmail, at: { gte: since } },
      select: { kind: true, actorEmail: true, subjectId: true, at: true },
      take: 50,
    });
    if (!isNewLook(input, recent)) return;

    await prisma.dataAccessLog.create({
      data: {
        kind: input.kind,
        actorEmail: input.actorEmail,
        subjectId: input.subjectId ?? null,
      },
    });
  } catch {
    // Deliberately silent. See the file comment: the read is the thing the
    // person came for, and losing a log line is the cheaper failure.
  }
}

/** Who has been through one subject's record, most recent first. */
export async function whoLookedAt(subjectId: string, take = 200) {
  const rows = await prisma.dataAccessLog.findMany({
    where: { subjectId },
    orderBy: { at: "desc" },
    take,
    select: { kind: true, actorEmail: true, subjectId: true, at: true },
  });
  return looksAtSubject(rows, subjectId);
}

/** What each person has been reading, over a span. */
export async function readingSummary(days = 30) {
  const rows = await prisma.dataAccessLog.findMany({
    where: { at: { gte: new Date(Date.now() - days * 86_400_000) } },
    orderBy: { at: "desc" },
    take: 5000,
    select: { kind: true, actorEmail: true, subjectId: true, at: true },
  });
  return { actors: byActor(rows), looks: rows.length, days };
}

/**
 * Drops read records past their retention.
 *
 * Called from the daily digest job, alongside the view-key blanking it sits
 * next to — the same kind of housekeeping on the same schedule.
 */
export async function sweepReadLog(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.dataAccessLog.deleteMany({
    where: { at: { lt: retentionCutoff(now) } },
  });
  return count;
}
