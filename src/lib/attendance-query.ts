import { ApiError } from "@/lib/api-guard";
import { prisma } from "@/lib/db";
import { fromIsoDate, toIsoDate, todayIso, type IsoDate } from "@/lib/dates";
import { canRecordFor, type AttendanceRow } from "@/lib/attendance";
import type { AttendanceStatus } from "@prisma/client";

/**
 * Reading and writing a group's roll.
 *
 * The rules are in `attendance.ts`. What this file is careful about is that a
 * roll is written by one person on one evening and must not be doubled: two
 * leaders opening the form at once is the ordinary case, not the exotic one.
 */

const meetingShape = {
  id: true,
  date: true,
  topic: true,
  visitorCount: true,
  cancelled: true,
  leaderNotes: true,
  recordedByEmail: true,
} as const;

export type MeetingInput = {
  topic?: string | null;
  visitorCount?: number;
  cancelled?: boolean;
  leaderNotes?: string | null;
};

/**
 * The meeting for a group on a day, made if it isn't there yet.
 *
 * An upsert on (group, date) rather than a create: the unique index is what
 * stops two leaders producing two half-filled rolls, and an upsert is what
 * turns that collision into the obvious behaviour — the second one edits the
 * first rather than being refused.
 */
export async function openMeeting(
  groupId: string,
  date: IsoDate,
  input: MeetingInput,
  byEmail: string,
  today: IsoDate = todayIso(),
) {
  if (!canRecordFor(date, today)) {
    throw new ApiError(400, "future_meeting", "That evening hasn't happened yet.");
  }

  const data = {
    ...(input.topic !== undefined ? { topic: input.topic?.trim() || null } : {}),
    ...(input.visitorCount !== undefined ? { visitorCount: Math.max(0, Math.trunc(input.visitorCount)) } : {}),
    ...(input.cancelled !== undefined ? { cancelled: input.cancelled } : {}),
    ...(input.leaderNotes !== undefined ? { leaderNotes: input.leaderNotes?.trim() || null } : {}),
  };

  return prisma.smallGroupMeeting.upsert({
    where: { groupId_date: { groupId, date: fromIsoDate(date) } },
    create: { groupId, date: fromIsoDate(date), recordedByEmail: byEmail, ...data },
    update: { recordedByEmail: byEmail, ...data },
    select: meetingShape,
  });
}

export type RollEntry = { userId: string; status: AttendanceStatus; note?: string | null };

/**
 * Writes the roll for one meeting.
 *
 * Only people currently in the group may be marked, checked here rather than
 * trusted from the form: a stale browser tab still holding somebody who left
 * must not put them back on a roll, and a crafted request must not add a
 * stranger to a group's records.
 *
 * Rows for members not in the submission are left alone rather than deleted —
 * a leader correcting one person's status at ten o'clock should not silently
 * blank everybody else's.
 */
export async function recordRoll(meetingId: string, entries: readonly RollEntry[]): Promise<number> {
  const meeting = await prisma.smallGroupMeeting.findUnique({
    where: { id: meetingId },
    select: { id: true, groupId: true },
  });
  if (!meeting) throw new ApiError(404, "not_found", "That meeting is gone.");

  const inTheGroup = new Set(
    (
      await prisma.smallGroupMember.findMany({
        where: { groupId: meeting.groupId, status: "ACTIVE" },
        select: { userId: true },
      })
    ).map((row) => row.userId),
  );

  const allowed = entries.filter((entry) => inTheGroup.has(entry.userId));
  if (allowed.length === 0) return 0;

  await prisma.$transaction(
    allowed.map((entry) =>
      prisma.groupAttendance.upsert({
        where: { meetingId_userId: { meetingId, userId: entry.userId } },
        create: { meetingId, userId: entry.userId, status: entry.status, note: entry.note?.trim() || null },
        update: { status: entry.status, note: entry.note?.trim() || null },
      }),
    ),
  );
  return allowed.length;
}

/** Recent meetings for a group, newest first, with their rolls. */
export async function meetingsFor(groupId: string, take = 12) {
  const rows = await prisma.smallGroupMeeting.findMany({
    where: { groupId },
    orderBy: { date: "desc" },
    take,
    select: {
      ...meetingShape,
      attendance: { select: { userId: true, status: true, note: true } },
    },
  });
  return rows.map((row) => ({ ...row, date: toIsoDate(row.date) }));
}

/**
 * One member's own attendance in a group.
 *
 * Scoped to the asking member in the query itself rather than filtered after,
 * so a wrong id returns nothing instead of somebody else's evenings.
 */
export async function myAttendance(groupId: string, userId: string) {
  const rows = await prisma.groupAttendance.findMany({
    where: { userId, meeting: { groupId } },
    orderBy: { meeting: { date: "desc" } },
    take: 26,
    select: { status: true, note: true, meeting: { select: { date: true, topic: true, cancelled: true } } },
  });
  return rows.map((row) => ({
    status: row.status,
    note: row.note,
    date: toIsoDate(row.meeting.date),
    topic: row.meeting.topic,
    cancelled: row.meeting.cancelled,
  }));
}

/** The rows a leader needs to work out who has gone quiet. */
export async function rollHistory(groupId: string, take = 12) {
  const meetings = await meetingsFor(groupId, take);
  return meetings.map((meeting) => ({
    id: meeting.id,
    date: meeting.date,
    cancelled: meeting.cancelled,
    visitorCount: meeting.visitorCount,
    attendance: meeting.attendance as AttendanceRow[],
  }));
}
