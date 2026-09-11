import type { AttendanceStatus } from "@prisma/client";
import { canLead, type GroupViewer, type Standing } from "@/lib/groups";
import { compareIsoDates, type IsoDate } from "@/lib/dates";

/**
 * Who came to a small group, and who is allowed to know.
 *
 * A roll is the most quietly sensitive thing a church keeps. It is not a
 * headcount: it is a record of where a named person was on a given evening,
 * kept for years, and the reason to keep it is pastoral — noticing that
 * somebody has stopped coming is how anybody gets rung up. So the rule this
 * file exists to hold is that **the roll goes to the people whose job it is to
 * ring round, and to nobody else**. A member sees their own attendance. Other
 * members see nothing, not even a count.
 *
 * `APOLOGIES` is a first-class answer rather than a flavour of absent, and that
 * distinction is the whole point of writing any of it down: a group that cannot
 * tell "let us know" from "vanished" chases the wrong person.
 */

export type AttendanceRow = {
  userId: string;
  status: AttendanceStatus;
  note: string | null;
};

export type MeetingRow = {
  id: string;
  date: IsoDate;
  cancelled: boolean;
  visitorCount: number;
};

/**
 * Whether this viewer may write a roll, or read the whole of one.
 *
 * The same answer for both, deliberately: the reason to see who was missing is
 * to do something about it, which is the leader's job. Reusing `canLead` rather
 * than restating it means a change to what leading means reaches here too.
 */
export function canKeepRoll(standing: Standing, viewer: GroupViewer): boolean {
  return canLead(standing, viewer);
}

/**
 * The attendance rows this viewer may see.
 *
 * A leader gets the roll. Anybody else gets their own row and nothing else —
 * not a redacted list, not a count of who else came, an array of at most one.
 * Returning a filtered list rather than a flag is what stops a page showing a
 * total it was never given the rows to compute.
 */
export function visibleAttendance(
  rows: readonly AttendanceRow[],
  standing: Standing,
  viewer: GroupViewer,
): AttendanceRow[] {
  if (canKeepRoll(standing, viewer)) return [...rows];
  if (viewer.userId === null) return [];
  return rows.filter((row) => row.userId === viewer.userId);
}

export type RollSummary = {
  present: number;
  apologies: number;
  absent: number;
  visitors: number;
  /** Everybody who was actually in the room — members present, plus visitors. */
  inTheRoom: number;
};

export function summariseRoll(rows: readonly AttendanceRow[], visitorCount: number): RollSummary {
  const count = (status: AttendanceStatus) => rows.filter((row) => row.status === status).length;
  const present = count("PRESENT");
  return {
    present,
    apologies: count("APOLOGIES"),
    absent: count("ABSENT"),
    visitors: Math.max(0, visitorCount),
    inTheRoom: present + Math.max(0, visitorCount),
  };
}

/**
 * How many of the last `window` meetings somebody came to.
 *
 * Cancelled meetings are not counted at either end — a week the group didn't
 * meet is not a week anybody missed, and letting it count would make a
 * fortnight off look like somebody drifting away.
 *
 * Meetings with no row for that member at all are counted as missed, because
 * the common case for a blank is a leader ticking the people who came and
 * leaving the rest. Treating a blank as "unknown" and dropping it would make
 * the one person nobody ticked look like a perfect attender.
 */
export function attendanceRate(
  meetings: readonly (MeetingRow & { attendance: readonly AttendanceRow[] })[],
  userId: string,
  window = 8,
): { came: number; outOf: number } {
  const counted = meetings
    .filter((meeting) => !meeting.cancelled)
    .sort((a, b) => compareIsoDates(b.date, a.date))
    .slice(0, window);

  const came = counted.filter((meeting) =>
    meeting.attendance.some((row) => row.userId === userId && row.status === "PRESENT"),
  ).length;

  return { came, outOf: counted.length };
}

/**
 * Members a leader might want to ring: nobody has marked them present for the
 * last `missed` meetings running, and they didn't send apologies for the most
 * recent one either.
 *
 * Apologies for the latest meeting takes somebody off this list even if they
 * have missed a month, because they have just been in touch — which is the
 * thing the list is trying to prompt. Somebody who sent apologies four weeks
 * ago and has said nothing since is still on it.
 */
export function quietlyMissing(
  meetings: readonly (MeetingRow & { attendance: readonly AttendanceRow[] })[],
  memberIds: readonly string[],
  missed = 3,
): string[] {
  const recent = meetings
    .filter((meeting) => !meeting.cancelled)
    .sort((a, b) => compareIsoDates(b.date, a.date))
    .slice(0, missed);

  // Not enough meetings to know yet. Saying "everybody is missing" the week a
  // group starts is how a useful list gets ignored.
  if (recent.length < missed) return [];

  return memberIds.filter((userId) => {
    const cameAtAll = recent.some((meeting) =>
      meeting.attendance.some((row) => row.userId === userId && row.status === "PRESENT"),
    );
    if (cameAtAll) return false;
    const latest = recent[0].attendance.find((row) => row.userId === userId);
    return latest?.status !== "APOLOGIES";
  });
}

/**
 * Whether a roll may be written for this date.
 *
 * The future is refused: a roll is a record of what happened, and a meeting
 * that hasn't happened has nothing to record. Today is allowed, because a
 * leader writes it up on the night.
 */
export function canRecordFor(date: IsoDate, today: IsoDate): boolean {
  return compareIsoDates(date, today) <= 0;
}

/** What to show somebody who can't have the roll. */
export const ROLL_WITHHELD = "Only this group's leaders can see who came.";
