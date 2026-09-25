/**
 * Recording who *looked* — the rules, with no database near them.
 *
 * The app has logged writes since the beginning: who changed a role, who
 * deleted a comment. It has never logged reads, and reads are the half that
 * matters for the data this app has grown into. A giving record, a household
 * address, a children's register, a text conversation, a safeguarding file —
 * for every one of those, "who looked at this, and when" is a question a church
 * may one day have to answer, and right now nothing in the codebase can.
 *
 * Four decisions make this recordable without making it useless.
 *
 *   1. **Only reads that identify a person.** The catalogue, the events list
 *      and the hymn index are not audited. A log that records everything is a
 *      log nobody reads, and a log nobody reads is worse than none because it
 *      is mistaken for oversight.
 *   2. **One line per look, not per row.** Opening the giving page is one
 *      entry, not four hundred. The unit is a person going to a screen.
 *   3. **Coalesced.** Somebody refreshing a page five times in a minute looked
 *      once. Without this the log is unreadable and the write load is absurd —
 *      the same reasoning as the view throttle in `view-key.ts`, and the same
 *      shape.
 *   4. **The log does not repeat what was read.** It says "the giving list",
 *      never "Ruth Bell's £50". This is what stops an oversight record
 *      becoming a second, more widely-readable copy of the sensitive data it
 *      exists to protect. Where one person really is the subject, their id is
 *      recorded and nothing else: an id is resolvable only by somebody who
 *      already has access to that record.
 */

/**
 * The kinds of read worth recording.
 *
 * A fixed list rather than a free string, so adding one is a decision somebody
 * makes on purpose and the log stays groupable. Each is a *screen*, which is
 * the unit a person actually looks at.
 */
export const AUDITED_READS = {
  giving_list: "the giving records",
  giving_statement: "a household's giving statement",
  household: "a household's details",
  checkin_register: "a children's register",
  sms_thread: "a text conversation",
  safeguarding_register: "the safeguarding register",
  withdrawal_reason: "why a clearance was withdrawn",
  group_roll: "a small group's attendance roll",
} as const;

/**
 * Two things deliberately not on that list.
 *
 * **The member directory.** Every signed-in member may read it and everybody in
 * it put themselves there, one field at a time. Logging every visit would be
 * the highest-volume entry by an order of magnitude and would say nothing: the
 * people listed already decided to be findable.
 *
 * **A member's own data export.** The reader and the subject are the same
 * person, so "who looked" has one answer and it is not interesting. It is
 * rate-limited and write-audited already.
 *
 * Both are judgements rather than oversights, and the reason they are written
 * down here is that a list which quietly grows to cover everything is a list
 * that stops meaning anything.
 */

export type AuditedRead = keyof typeof AUDITED_READS;

export const AUDITED_READ_KEYS = Object.keys(AUDITED_READS) as AuditedRead[];

/** What a kind reads as in the log. */
export function describeRead(kind: AuditedRead): string {
  return AUDITED_READS[kind];
}

/**
 * How long one actor looking at one thing counts as the same look.
 *
 * Half an hour. Long enough that working through a screen is one entry; short
 * enough that coming back after lunch is a second one, which is the
 * distinction somebody reviewing the log actually cares about.
 */
export const LOOK_WINDOW_SECONDS = 30 * 60;

/**
 * How long a read record is kept.
 *
 * A year, because the question this log answers — "who saw this?" — is asked
 * after a complaint or an audit, and those do not arrive within a fortnight.
 * Kept bounded all the same: a read log that grows for ever is one nobody can
 * query and, eventually, a liability of its own.
 */
export const READ_LOG_RETENTION_DAYS = 365;

export type LookInput = {
  kind: AuditedRead;
  /** Who looked. */
  actorEmail: string;
  /** Whose record, when a single person is the subject. Never a name. */
  subjectId?: string | null;
};

export type ExistingLook = { kind: string; actorEmail: string; subjectId: string | null; at: Date };

/**
 * Whether this look is a new one, or the same person still looking at the same
 * thing.
 *
 * Compared on all three of kind, actor and subject: the same officer opening
 * two different households in one sitting is two looks, because which
 * household they opened is the whole content of the record.
 */
export function isNewLook(
  input: LookInput,
  recent: readonly ExistingLook[],
  now: Date = new Date(),
  windowSeconds = LOOK_WINDOW_SECONDS,
): boolean {
  const subject = input.subjectId ?? null;
  return !recent.some(
    (look) =>
      look.kind === input.kind &&
      look.actorEmail === input.actorEmail &&
      look.subjectId === subject &&
      now.getTime() - look.at.getTime() < windowSeconds * 1000,
  );
}

/** The cutoff before which read records are swept. */
export function retentionCutoff(now: Date = new Date(), days = READ_LOG_RETENTION_DAYS): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

export type LookRow = { kind: string; actorEmail: string; subjectId: string | null; at: Date };

/**
 * Who has looked at one subject, most recent first.
 *
 * The query a complaint actually starts with: somebody asks who has been
 * through their record, and the answer has to be a list of people and dates.
 */
export function looksAtSubject(rows: readonly LookRow[], subjectId: string): LookRow[] {
  return rows
    .filter((row) => row.subjectId === subjectId)
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}

export type ActorSummary = { actorEmail: string; looks: number; kinds: string[]; lastAt: Date };

/**
 * What each person has been looking at.
 *
 * The other question: not "who saw Ruth's record" but "what has this member of
 * staff been reading". A summary rather than a feed, because a feed of every
 * look is a wall of text that hides the one pattern worth noticing — somebody
 * going through records their job does not touch.
 */
export function byActor(rows: readonly LookRow[]): ActorSummary[] {
  const actors = new Map<string, { looks: number; kinds: Set<string>; lastAt: Date }>();

  for (const row of rows) {
    const running = actors.get(row.actorEmail) ?? { looks: 0, kinds: new Set<string>(), lastAt: row.at };
    running.looks += 1;
    running.kinds.add(row.kind);
    if (row.at > running.lastAt) running.lastAt = row.at;
    actors.set(row.actorEmail, running);
  }

  return [...actors.entries()]
    .map(([actorEmail, running]) => ({
      actorEmail,
      looks: running.looks,
      kinds: [...running.kinds].sort(),
      lastAt: running.lastAt,
    }))
    .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
}
