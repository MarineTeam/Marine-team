import { describe, it, expect } from "vitest";
import {
  attendanceRate,
  canKeepRoll,
  canRecordFor,
  quietlyMissing,
  summariseRoll,
  visibleAttendance,
  type AttendanceRow,
  type MeetingRow,
} from "./attendance";
import type { GroupViewer } from "./groups";

const leader: GroupViewer = { userId: "lead", manages: false };
const member: GroupViewer = { userId: "mem", manages: false };
const staff: GroupViewer = { userId: "boss", manages: true };
const stranger: GroupViewer = { userId: "other", manages: false };
const signedOut: GroupViewer = { userId: null, manages: false };

const roll: AttendanceRow[] = [
  { userId: "lead", status: "PRESENT", note: null },
  { userId: "mem", status: "APOLOGIES", note: "Away with work" },
  { userId: "third", status: "ABSENT", note: null },
];

describe("canKeepRoll", () => {
  it("is the group's leaders and whoever keeps the group list", () => {
    expect(canKeepRoll("leader", leader)).toBe(true);
    expect(canKeepRoll("none", staff)).toBe(true);
  });

  it("is not an ordinary member", () => {
    // The reason to see who was missing is to do something about it.
    expect(canKeepRoll("member", member)).toBe(false);
    expect(canKeepRoll("requested", member)).toBe(false);
    expect(canKeepRoll("waitlisted", member)).toBe(false);
    expect(canKeepRoll("none", stranger)).toBe(false);
  });
});

describe("visibleAttendance", () => {
  it("gives a leader the roll", () => {
    expect(visibleAttendance(roll, "leader", leader)).toHaveLength(3);
  });

  it("gives a member their own row and nothing else", () => {
    // Not a redacted list and not a count — an array of at most one, so a page
    // cannot show a total it was never given the rows to compute.
    const seen = visibleAttendance(roll, "member", member);
    expect(seen).toEqual([{ userId: "mem", status: "APOLOGIES", note: "Away with work" }]);
  });

  it("gives somebody outside the group nothing at all", () => {
    expect(visibleAttendance(roll, "none", stranger)).toEqual([]);
    expect(visibleAttendance(roll, "none", signedOut)).toEqual([]);
  });

  it("never lets a member infer the size of the room", () => {
    const seen = visibleAttendance(roll, "member", member);
    expect(summariseRoll(seen, 0).inTheRoom).toBe(0);
    expect(seen.length).toBeLessThan(roll.length);
  });
});

describe("summariseRoll", () => {
  it("counts each answer, and everybody who was in the room", () => {
    expect(summariseRoll(roll, 2)).toEqual({
      present: 1,
      apologies: 1,
      absent: 1,
      visitors: 2,
      inTheRoom: 3,
    });
  });

  it("keeps apologies out of both present and absent", () => {
    // The distinction is the whole point of writing it down.
    const s = summariseRoll(roll, 0);
    expect(s.present).toBe(1);
    expect(s.absent).toBe(1);
    expect(s.apologies).toBe(1);
  });

  it("refuses a negative visitor count rather than subtracting from the room", () => {
    expect(summariseRoll(roll, -5)).toMatchObject({ visitors: 0, inTheRoom: 1 });
  });
});

const meeting = (date: string, rows: AttendanceRow[], cancelled = false): MeetingRow & { attendance: AttendanceRow[] } => ({
  id: date,
  date,
  cancelled,
  visitorCount: 0,
  attendance: rows,
});
const came = (id: string): AttendanceRow => ({ userId: id, status: "PRESENT", note: null });
const apologised = (id: string): AttendanceRow => ({ userId: id, status: "APOLOGIES", note: null });

describe("attendanceRate", () => {
  it("counts the last few meetings, most recent first", () => {
    const meetings = [
      meeting("2026-01-06", [came("a")]),
      meeting("2026-01-13", []),
      meeting("2026-01-20", [came("a")]),
    ];
    expect(attendanceRate(meetings, "a", 3)).toEqual({ came: 2, outOf: 3 });
  });

  it("ignores a week the group didn't meet, at both ends", () => {
    // A fortnight off must not look like somebody drifting away.
    const meetings = [
      meeting("2026-01-06", [came("a")]),
      meeting("2026-01-13", [], true),
      meeting("2026-01-20", [came("a")]),
    ];
    expect(attendanceRate(meetings, "a", 8)).toEqual({ came: 2, outOf: 2 });
  });

  it("counts a member with no row at all as missed", () => {
    // A blank usually means the leader ticked who came and left the rest.
    // Treating it as unknown would make the one person nobody ticked look
    // like a perfect attender.
    const meetings = [meeting("2026-01-06", [came("a")]), meeting("2026-01-13", [came("a")])];
    expect(attendanceRate(meetings, "b", 8)).toEqual({ came: 0, outOf: 2 });
  });

  it("does not count apologies as coming", () => {
    expect(attendanceRate([meeting("2026-01-06", [apologised("a")])], "a", 8)).toEqual({ came: 0, outOf: 1 });
  });

  it("honours the window", () => {
    const meetings = Array.from({ length: 12 }, (_, i) => meeting(`2026-02-${String(i + 1).padStart(2, "0")}`, [came("a")]));
    expect(attendanceRate(meetings, "a", 4)).toEqual({ came: 4, outOf: 4 });
  });
});

describe("quietlyMissing", () => {
  const members = ["a", "b", "c"];

  it("names somebody who has missed the last three without a word", () => {
    const meetings = [
      meeting("2026-01-06", [came("a"), came("b")]),
      meeting("2026-01-13", [came("a"), came("b")]),
      meeting("2026-01-20", [came("a"), came("b")]),
    ];
    expect(quietlyMissing(meetings, members, 3)).toEqual(["c"]);
  });

  it("takes somebody off the list the moment they send apologies", () => {
    // They have just been in touch, which is the thing this list is for.
    const meetings = [
      meeting("2026-01-06", [came("a")]),
      meeting("2026-01-13", [came("a")]),
      meeting("2026-01-20", [came("a"), apologised("c")]),
    ];
    expect(quietlyMissing(meetings, members, 3)).not.toContain("c");
  });

  it("keeps somebody whose apologies were weeks ago and has said nothing since", () => {
    const meetings = [
      meeting("2026-01-06", [came("a"), apologised("c")]),
      meeting("2026-01-13", [came("a")]),
      meeting("2026-01-20", [came("a")]),
    ];
    expect(quietlyMissing(meetings, members, 3)).toContain("c");
  });

  it("says nothing at all until there are enough meetings to judge", () => {
    // "Everybody is missing" in a group's first week is how a useful list
    // gets ignored.
    expect(quietlyMissing([meeting("2026-01-06", [])], members, 3)).toEqual([]);
  });

  it("skips cancelled meetings when counting the run", () => {
    const meetings = [
      meeting("2026-01-06", [came("a")]),
      meeting("2026-01-13", [], true),
      meeting("2026-01-20", [came("a")]),
    ];
    expect(quietlyMissing(meetings, members, 3)).toEqual([]);
  });
});

describe("canRecordFor", () => {
  it("allows the night itself and anything before it", () => {
    expect(canRecordFor("2026-06-01", "2026-06-01")).toBe(true);
    expect(canRecordFor("2026-05-25", "2026-06-01")).toBe(true);
  });

  it("refuses a meeting that hasn't happened", () => {
    // A roll is a record of what happened.
    expect(canRecordFor("2026-06-08", "2026-06-01")).toBe(false);
  });
});
