import type { ClearanceKind } from "@prisma/client";
import { compareIsoDates, isoDayDifference, type IsoDate } from "@/lib/dates";

/**
 * Safeguarding clearance — the rules, with no database near them.
 *
 * The app already signs children into a room and controls who may collect
 * them, and already schedules volunteers onto teams. Neither knew whether the
 * adult doing either of those things had been checked. A church that keeps its
 * children's register on a computer and its safeguarding status in a folder
 * has the two halves in the wrong places: the computer can say exactly which
 * adult was at the door, and cannot say whether they were cleared to be there.
 *
 * Three decisions run through this file.
 *
 *   1. **It refuses rather than warns.** A warning on a rota screen is a thing
 *      somebody clicks past at half past eight on a Sunday morning. The
 *      booking checker refuses a double-booked hall; this refuses an uncleared
 *      volunteer, for a considerably better reason.
 *   2. **Withdrawn is not expired.** They read differently and mean different
 *      things — one is a date nobody got to, the other is a decision somebody
 *      made — and a system that collapses them tells a later enquiry the wrong
 *      story.
 *   3. **Expiry is chased before it happens**, far enough ahead that a check
 *      can actually be renewed in the time. A clearance that lapses on the
 *      Saturday is a volunteer who cannot serve on the Sunday, and nobody
 *      finds out until the Sunday.
 *
 * What this file deliberately cannot do is hold the certificate. There is no
 * type here with a disclosure number, an offence, or a document on it — see
 * the schema comment on `VolunteerClearance`. A rules module that cannot
 * represent a thing is a codebase that cannot accidentally store it.
 */

/**
 * Every kind, as a value rather than only a type.
 *
 * Zod needs a runtime list to validate against, and deriving it from the
 * Prisma enum at runtime is not possible — so it is written once here and a
 * type-level check below fails the build if the two ever drift apart.
 */
export const CLEARANCE_KINDS = ["BACKGROUND_CHECK", "REFERENCES", "TRAINING"] as const;

/** If a kind is added to the schema and not here, this stops compiling. */
const _kindsAreComplete: readonly ClearanceKind[] = CLEARANCE_KINDS;
type _EveryKindListed = Exclude<ClearanceKind, (typeof CLEARANCE_KINDS)[number]> extends never
  ? true
  : never;
const _everyKindListed: _EveryKindListed = true;
void _kindsAreComplete;
void _everyKindListed;

export type ClearanceRow = {
  kind: ClearanceKind;
  verifiedOn: IsoDate;
  expiresOn: IsoDate;
  withdrawnAt: Date | null;
};

/** Why somebody is not cleared, in the words the answer gets given in. */
export type ClearanceState = "current" | "expiring" | "expired" | "withdrawn" | "missing";

/**
 * Whether a single record still counts, on a given day.
 *
 * The expiry day itself counts. A certificate that says "valid until 1 March"
 * is valid on 1 March, and a system that reads it as lapsing that morning
 * turns out to be arguing with the document in front of it.
 */
export function stateOf(row: ClearanceRow | null, today: IsoDate, warnDays = 60): ClearanceState {
  if (!row) return "missing";
  if (row.withdrawnAt !== null) return "withdrawn";
  const away = isoDayDifference(today, row.expiresOn);
  if (away < 0) return "expired";
  return away <= warnDays ? "expiring" : "current";
}

/** Whether a state is one somebody may serve under. */
export function isCleared(state: ClearanceState): boolean {
  return state === "current" || state === "expiring";
}

/**
 * The record that speaks for somebody, of one kind.
 *
 * The one that lasts longest, not the most recent: a church that takes a new
 * check while the old one is still running has somebody *more* cleared, not
 * less, and reading only the latest row would let an early renewal shorten
 * somebody's standing. Withdrawn rows are skipped unless they are all there
 * is — a withdrawal has to be able to speak, or withdrawing would silently
 * fall back to the record before it.
 */
export function bestOf(rows: readonly ClearanceRow[], kind: ClearanceKind): ClearanceRow | null {
  const ofKind = rows.filter((row) => row.kind === kind);
  if (ofKind.length === 0) return null;
  const live = ofKind.filter((row) => row.withdrawnAt === null);
  const pool = live.length > 0 ? live : ofKind;
  return pool.reduce((best, row) => (compareIsoDates(row.expiresOn, best.expiresOn) > 0 ? row : best));
}

export type Verdict =
  | { ok: true; warnings: { kind: ClearanceKind; daysLeft: number }[] }
  | { ok: false; reason: string; failing: { kind: ClearanceKind; state: ClearanceState }[] };

/**
 * Whether somebody may take on a job that requires certain clearances.
 *
 * Every required kind is checked and *all* the failures are reported, not just
 * the first. Somebody chasing paperwork needs to know it is the check and the
 * references, rather than discovering the second one a week after sorting the
 * first.
 */
export function mayServe(input: {
  rows: readonly ClearanceRow[];
  required: readonly ClearanceKind[];
  today: IsoDate;
  warnDays?: number;
}): Verdict {
  const { rows, required, today, warnDays = 60 } = input;

  const failing: { kind: ClearanceKind; state: ClearanceState }[] = [];
  const warnings: { kind: ClearanceKind; daysLeft: number }[] = [];

  for (const kind of required) {
    const row = bestOf(rows, kind);
    const state = stateOf(row, today, warnDays);
    if (!isCleared(state)) {
      failing.push({ kind, state });
      continue;
    }
    if (state === "expiring" && row) {
      warnings.push({ kind, daysLeft: isoDayDifference(today, row.expiresOn) });
    }
  }

  if (failing.length > 0) return { ok: false, reason: refusalMessage(failing), failing };
  return { ok: true, warnings };
}

/** What a kind is called on screen. */
export function kindLabel(kind: ClearanceKind): string {
  switch (kind) {
    case "BACKGROUND_CHECK":
      return "a criminal-records check";
    case "REFERENCES":
      return "references";
    case "TRAINING":
      return "safeguarding training";
  }
}

/** And how each failure reads on its own. */
function phraseFor(kind: ClearanceKind, state: ClearanceState): string {
  const what = kindLabel(kind);
  switch (state) {
    case "missing":
      return `no record of ${what}`;
    case "expired":
      return `${what} has expired`;
    case "withdrawn":
      return `${what} was withdrawn`;
    default:
      return what;
  }
}

/**
 * What to tell whoever tried to make the assignment.
 *
 * Says what is missing and never why it was withdrawn. The reason for a
 * withdrawal is the most sensitive thing this feature touches and it does not
 * belong in an error message on a rota screen, where it would be read by
 * whoever happened to be scheduling that week.
 */
export function refusalMessage(failing: readonly { kind: ClearanceKind; state: ClearanceState }[]): string {
  if (failing.length === 0) return "";
  const phrases = failing.map((entry) => phraseFor(entry.kind, entry.state));
  const list =
    phrases.length === 1
      ? phrases[0]
      : `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;
  return `They can't be put on this team yet — ${list}.`;
}

/**
 * How an expiry reads on the list.
 *
 * Days rather than a date, because "expires in 9 days" is acted on and
 * "expires 27/09/2026" is read as information.
 */
export function expiryLabel(row: ClearanceRow, today: IsoDate): string {
  if (row.withdrawnAt !== null) return "withdrawn";
  const away = isoDayDifference(today, row.expiresOn);
  if (away < 0) return `expired ${-away} day${away === -1 ? "" : "s"} ago`;
  if (away === 0) return "expires today";
  return `expires in ${away} day${away === 1 ? "" : "s"}`;
}

/**
 * The clearances worth chasing, soonest first.
 *
 * Expired ones are included rather than written off: somebody whose check ran
 * out in March is the *most* urgent person on the list, and a chase list that
 * only looks forwards quietly drops everybody it already failed.
 */
export function needsChasing<T extends ClearanceRow>(
  rows: readonly T[],
  today: IsoDate,
  warnDays = 60,
): T[] {
  return rows
    .filter((row) => {
      const state = stateOf(row, today, warnDays);
      return state === "expiring" || state === "expired";
    })
    .sort((a, b) => compareIsoDates(a.expiresOn, b.expiresOn));
}

/**
 * Whether a record makes sense before it is written.
 *
 * An expiry before the verification date is a typo, and a verification a long
 * way in the future is the other typo — somebody entering 2027 for 2026. Both
 * are refused at the point of entry, where they can still be corrected by the
 * person who knows what the document said.
 */
export function checkEntry(input: {
  verifiedOn: IsoDate;
  expiresOn: IsoDate;
  today: IsoDate;
}): { ok: true } | { ok: false; reason: string } {
  const { verifiedOn, expiresOn, today } = input;
  if (compareIsoDates(expiresOn, verifiedOn) <= 0) {
    return { ok: false, reason: "It can't expire before it was checked." };
  }
  if (compareIsoDates(verifiedOn, today) > 0) {
    return { ok: false, reason: "That's a date in the future — when was the document actually seen?" };
  }
  return { ok: true };
}
