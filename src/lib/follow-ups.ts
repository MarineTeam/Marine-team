import type { FollowUpSource, FollowUpStatus } from "@prisma/client";
import { compareIsoDates, isoDayDifference, type IsoDate } from "@/lib/dates";

/**
 * Follow-ups — the rules, with no database near them.
 *
 * The app already knew who had gone quiet and already collected connect
 * cards. Neither turned into "Ruth, ring this person, by Friday", so both
 * stayed reports. This is the missing half: the point where pastoral data
 * becomes something a person does.
 *
 * Two decisions run through it.
 *
 *   1. **Unassigned is a state worth seeing**, not a default. A queue where
 *      everything belongs to the pastor by default is a queue nobody else
 *      looks at, and one where nothing has an owner is a queue nothing leaves.
 *      So `assignedToId` is nullable and the list puts the unclaimed first.
 *   2. **Dismissed is not deleted.** "We looked and decided against" is a
 *      different fact from "nobody got to it", and only one of them needs
 *      chasing. A queue that hides the first becomes a queue people delete
 *      things out of.
 */

export type FollowUpRow = {
  id: string;
  title: string;
  status: FollowUpStatus;
  source: FollowUpSource;
  dueOn: IsoDate;
  assignedToId: string | null;
  personId: string | null;
};

export type FollowUpViewer = {
  userId: string | null;
  /** Whether they keep the follow-up list (`manage_people`, or an admin). */
  manages: boolean;
};

/**
 * Whether this viewer may see a follow-up at all.
 *
 * The office sees the queue. Everybody else sees only what is theirs — a
 * follow-up names somebody and often says why they are being rung, which is
 * not a thing to leave on a shared screen.
 */
export function canSee(row: FollowUpRow, viewer: FollowUpViewer): boolean {
  if (viewer.manages) return true;
  return viewer.userId !== null && row.assignedToId === viewer.userId;
}

export function visibleFollowUps(rows: readonly FollowUpRow[], viewer: FollowUpViewer): FollowUpRow[] {
  return rows.filter((row) => canSee(row, viewer));
}

/** Whether somebody may close or reassign it: the office, or whoever holds it. */
export function canAct(row: FollowUpRow, viewer: FollowUpViewer): boolean {
  return canSee(row, viewer);
}

export type Urgency = "overdue" | "today" | "soon" | "later" | "closed";

/**
 * How a follow-up reads on the list.
 *
 * Overdue is deliberately its own word rather than a red date: a list where
 * lateness is a colour is a list that gets skimmed.
 */
export function urgencyOf(row: FollowUpRow, today: IsoDate, soonDays = 7): Urgency {
  if (row.status !== "OPEN") return "closed";
  const away = isoDayDifference(today, row.dueOn);
  if (away < 0) return "overdue";
  if (away === 0) return "today";
  return away <= soonDays ? "soon" : "later";
}

/**
 * The queue, in the order it should be worked.
 *
 * Unclaimed first among equals, then by date. Somebody opening this screen
 * should be looking at the thing nobody has picked up before the thing that is
 * already somebody's.
 */
export function inWorkingOrder(rows: readonly FollowUpRow[], today: IsoDate): FollowUpRow[] {
  const rank = (row: FollowUpRow) => {
    const urgency = urgencyOf(row, today);
    if (urgency === "closed") return 4;
    if (urgency === "overdue") return 0;
    if (urgency === "today") return 1;
    return urgency === "soon" ? 2 : 3;
  };
  return [...rows].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const unclaimed = Number(b.assignedToId === null) - Number(a.assignedToId === null);
    if (unclaimed !== 0) return unclaimed;
    return compareIsoDates(a.dueOn, b.dueOn) || a.title.localeCompare(b.title);
  });
}

export type QueueCounts = { open: number; overdue: number; unassigned: number; done: number; dismissed: number };

export function countQueue(rows: readonly FollowUpRow[], today: IsoDate): QueueCounts {
  return {
    open: rows.filter((row) => row.status === "OPEN").length,
    overdue: rows.filter((row) => urgencyOf(row, today) === "overdue").length,
    unassigned: rows.filter((row) => row.status === "OPEN" && row.assignedToId === null).length,
    done: rows.filter((row) => row.status === "DONE").length,
    dismissed: rows.filter((row) => row.status === "DISMISSED").length,
  };
}

export type Prompt = {
  source: FollowUpSource;
  sourceRef: string;
  title: string;
  personId: string | null;
  note: string | null;
};

/**
 * The prompts a sweep found that have no follow-up yet.
 *
 * Matched on (source, reference), which is what the unique index enforces:
 * running the sweep twice must not raise the same card twice, and a card
 * somebody has already *dismissed* must not come back the next night — which
 * is the failure that teaches people to ignore a queue.
 */
export function newPrompts(
  prompts: readonly Prompt[],
  existing: readonly { source: FollowUpSource; sourceRef: string | null }[],
): Prompt[] {
  const seen = new Set(existing.map((row) => `${row.source}:${row.sourceRef ?? ""}`));
  return prompts.filter((prompt) => !seen.has(`${prompt.source}:${prompt.sourceRef}`));
}

/** How long after the prompt the job is due, by what prompted it. */
export function defaultDueDays(source: FollowUpSource): number {
  switch (source) {
    // Somebody filled in a card asking to be contacted. A fortnight later is
    // not a follow-up, it is an apology.
    case "FORM":
      return 2;
    // They came to something. Worth a word while they remember it.
    case "EVENT":
      return 7;
    // They have already been missing for weeks; a few days more won't hurt,
    // and a date somebody can actually meet is a date they meet.
    case "GROUP_ABSENCE":
      return 7;
    case "MANUAL":
      return 7;
  }
}

/** What to say on a card raised by a sweep, so the queue reads as sentences. */
export function titleFor(source: FollowUpSource, who: string): string {
  switch (source) {
    case "FORM":
      return `${who} filled in a card`;
    case "EVENT":
      return `${who} came to something for the first time`;
    case "GROUP_ABSENCE":
      return `${who} has stopped coming to their group`;
    case "MANUAL":
      return who;
  }
}

/**
 * Closing a follow-up.
 *
 * An outcome is required for DONE and optional for DISMISSED: "we rang and
 * they've moved away" is the useful half of the record, and a queue of jobs
 * marked done with nothing written is a queue that taught nobody anything.
 */
export type CloseResult = { ok: true; status: FollowUpStatus; outcome: string | null } | { ok: false; reason: string };

export function closeWith(status: FollowUpStatus, outcome: string | undefined): CloseResult {
  const text = outcome?.trim() || null;
  if (status === "DONE" && !text) {
    return { ok: false, reason: "Say what came of it — a job closed with nothing written teaches nobody anything." };
  }
  if (status === "OPEN") return { ok: false, reason: "That isn't a way to close one." };
  return { ok: true, status, outcome: text };
}
