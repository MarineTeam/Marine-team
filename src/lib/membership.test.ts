import { describe, it, expect } from "vitest";
import {
  byRoute,
  checkChange,
  inOrder,
  isJoining,
  publicEntry,
  revision,
  rollAt,
  spellsOf,
  wasMemberOn,
  type MembershipRow,
} from "@/lib/membership";

const TODAY = "2026-10-13";

let next = 0;
const event = (
  change: MembershipRow["change"],
  on: string,
  personId = "p1",
): MembershipRow => ({ id: `e${String(next++).padStart(3, "0")}`, personId, change, on });

describe("which way a change goes", () => {
  it("knows the joinings", () => {
    for (const change of ["BAPTISM", "PROFESSION", "TRANSFER_IN", "RESTORED"] as const) {
      expect(isJoining(change)).toBe(true);
    }
  });

  it("knows the leavings", () => {
    for (const change of ["DEATH", "TRANSFER_OUT", "REQUEST", "LAPSED"] as const) {
      expect(isJoining(change)).toBe(false);
    }
  });

  it("treats being restored as a joining, not a transfer", () => {
    // Its own change because an annual return asks about it separately, and
    // because "a member since" should date from the restoration.
    expect(isJoining("RESTORED")).toBe(true);
  });
});

describe("whether somebody was on the roll on a day", () => {
  const history = [event("TRANSFER_IN", "2020-03-01"), event("TRANSFER_OUT", "2023-06-30")];

  it("says no before they ever joined", () => {
    expect(wasMemberOn(history, "2020-02-29")).toBe(false);
  });

  it("says yes on the very day they joined", () => {
    // That is what the date on the certificate means.
    expect(wasMemberOn(history, "2020-03-01")).toBe(true);
  });

  it("says yes in between", () => {
    expect(wasMemberOn(history, "2021-01-01")).toBe(true);
  });

  it("says no on the day they left", () => {
    expect(wasMemberOn(history, "2023-06-30")).toBe(false);
  });

  it("says no afterwards", () => {
    expect(wasMemberOn(history, "2026-01-01")).toBe(false);
  });

  it("says no when there is no history at all", () => {
    expect(wasMemberOn([], "2026-01-01")).toBe(false);
  });

  it("is not fooled by events handed over in the wrong order", () => {
    const muddled = [event("DEATH", "2024-01-01"), event("BAPTISM", "2010-05-05")];
    expect(wasMemberOn(muddled, "2015-01-01")).toBe(true);
    expect(wasMemberOn(muddled, "2025-01-01")).toBe(false);
  });
});

describe("ordering", () => {
  it("sorts oldest first", () => {
    const got = inOrder([event("DEATH", "2024-01-01"), event("BAPTISM", "2010-01-01")]);
    expect(got.map((row) => row.on)).toEqual(["2010-01-01", "2024-01-01"]);
  });

  it("breaks a same-day tie by id, so the order is total", () => {
    // Two events on one day would otherwise sort differently between calls,
    // and the alternation check would accept a sequence one time and refuse
    // it the next.
    const a: MembershipRow = { id: "aaa", personId: "p1", change: "BAPTISM", on: "2026-01-01" };
    const b: MembershipRow = { id: "bbb", personId: "p1", change: "DEATH", on: "2026-01-01" };
    expect(inOrder([b, a]).map((row) => row.id)).toEqual(["aaa", "bbb"]);
    expect(inOrder([a, b]).map((row) => row.id)).toEqual(["aaa", "bbb"]);
  });
});

describe("membership as spells", () => {
  it("gives one open spell for somebody who joined and stayed", () => {
    expect(spellsOf([event("BAPTISM", "2015-04-01")])).toEqual([
      { from: "2015-04-01", to: null, joined: "BAPTISM", left: null },
    ]);
  });

  it("closes the spell when they leave, and says how", () => {
    const got = spellsOf([event("TRANSFER_IN", "2015-04-01"), event("TRANSFER_OUT", "2019-09-01")]);
    expect(got).toEqual([
      { from: "2015-04-01", to: "2019-09-01", joined: "TRANSFER_IN", left: "TRANSFER_OUT" },
    ]);
  });

  it("gives two spells for somebody who came back", () => {
    const got = spellsOf([
      event("BAPTISM", "1998-06-01"),
      event("LAPSED", "2003-12-31"),
      event("RESTORED", "2019-02-01"),
    ]);
    expect(got).toHaveLength(2);
    expect(got[1]).toEqual({ from: "2019-02-01", to: null, joined: "RESTORED", left: null });
  });

  it("ignores a leaving that follows nothing", () => {
    expect(spellsOf([event("LAPSED", "2020-01-01")])).toEqual([]);
  });

  it("does not let a second leaving move the end date", () => {
    // Refused when written, but this walks whatever is in the table: a
    // stray second leaving must not rewrite when the spell actually ended.
    const got = spellsOf([
      event("BAPTISM", "2010-01-01"),
      event("TRANSFER_OUT", "2015-01-01"),
      event("LAPSED", "2020-01-01"),
    ]);
    expect(got).toHaveLength(1);
    expect(got[0].to).toBe("2015-01-01");
    expect(got[0].left).toBe("TRANSFER_OUT");
  });

  it("does not open a second spell on top of an open one", () => {
    // Refused when written; one already in the data must not count twice.
    const got = spellsOf([event("BAPTISM", "2010-01-01"), event("TRANSFER_IN", "2012-01-01")]);
    expect(got).toHaveLength(1);
  });
});

describe("whether a change may be recorded", () => {
  const joined = [event("TRANSFER_IN", "2020-01-01")];
  const gone = [...joined, event("TRANSFER_OUT", "2022-01-01")];

  it("allows a first joining", () => {
    expect(checkChange([], { change: "BAPTISM", on: "2026-01-01" }, TODAY).ok).toBe(true);
  });

  it("refuses a joining for somebody already on the roll", () => {
    const verdict = checkChange(joined, { change: "BAPTISM", on: "2021-01-01" }, TODAY);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toMatch(/already on the roll/i);
  });

  it("refuses a leaving for somebody who was not on it", () => {
    const verdict = checkChange(gone, { change: "DEATH", on: "2023-01-01" }, TODAY);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toMatch(/nothing to record them leaving from/i);
  });

  it("allows a leaving while they are on the roll", () => {
    expect(checkChange(joined, { change: "DEATH", on: "2021-06-01" }, TODAY).ok).toBe(true);
  });

  it("allows them back after they left", () => {
    expect(checkChange(gone, { change: "RESTORED", on: "2024-01-01" }, TODAY).ok).toBe(true);
  });

  it("judges it as at the event's own date, not today", () => {
    // Backfilling is normal: a transfer letter dated last March arrives in
    // June, and the question is whether they were a member last March.
    expect(checkChange(gone, { change: "TRANSFER_OUT", on: "2021-06-01" }, TODAY).ok).toBe(false);
    expect(checkChange(joined, { change: "TRANSFER_OUT", on: "2021-06-01" }, TODAY).ok).toBe(true);
  });

  it("refuses an insertion that breaks what comes after it", () => {
    // A joining slipped in before an existing joining corrupts the roll just
    // as surely as appending one does.
    const later = [event("RESTORED", "2024-01-01")];
    const verdict = checkChange(later, { change: "BAPTISM", on: "2020-01-01" }, TODAY);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toMatch(/already a joining, on 2024-01-01/);
  });

  it("refuses a leaving slipped in before another leaving", () => {
    const history = [event("BAPTISM", "2010-01-01"), event("DEATH", "2024-01-01")];
    const verdict = checkChange(history, { change: "LAPSED", on: "2020-01-01" }, TODAY);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toMatch(/already a leaving, on 2024-01-01/);
  });

  it("allows an insertion that alternates correctly with what follows", () => {
    // They left in 2015 and the record stops there, so a restoration in 2020
    // follows a leaving and precedes nothing: the sequence still alternates.
    const history = [event("BAPTISM", "2010-01-01"), event("TRANSFER_OUT", "2015-01-01")];
    expect(checkChange(history, { change: "RESTORED", on: "2020-01-01" }, TODAY).ok).toBe(true);
  });

  it("allows a leaving slipped into a gap between two spells", () => {
    // Joined 2010, back again 2020: a departure dated 2015 fits between them,
    // and the joining that follows it is then correct.
    const history = [event("BAPTISM", "2010-01-01"), event("RESTORED", "2020-01-01")];
    expect(checkChange(history, { change: "TRANSFER_OUT", on: "2015-01-01" }, TODAY).ok).toBe(true);
  });

  it("allows leaving on the same day they joined", () => {
    // Unusual and coherent — somebody transfers in and straight out again, or
    // dies the day they are received. An event on the same date has to count
    // as already having happened, or the day's own joining looks like one
    // still to come.
    expect(checkChange(joined, { change: "TRANSFER_OUT", on: "2020-01-01" }, TODAY).ok).toBe(true);
  });

  it("still refuses a second joining on the same day", () => {
    const verdict = checkChange(joined, { change: "BAPTISM", on: "2020-01-01" }, TODAY);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toMatch(/already on the roll/i);
  });

  it("refuses a date in the future", () => {
    const verdict = checkChange([], { change: "BAPTISM", on: "2027-01-01" }, TODAY);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toMatch(/in the future/i);
  });

  it("allows today itself", () => {
    expect(checkChange([], { change: "BAPTISM", on: TODAY }, TODAY).ok).toBe(true);
  });
});

describe("the roll as it stood on a day", () => {
  const everyone = [
    event("BAPTISM", "2015-01-01", "stayer"),
    event("TRANSFER_IN", "2018-06-01", "leaver"),
    event("TRANSFER_OUT", "2024-03-01", "leaver"),
    event("BAPTISM", "1998-01-01", "returner"),
    event("LAPSED", "2003-01-01", "returner"),
    event("RESTORED", "2022-01-01", "returner"),
    event("PROFESSION", "2026-11-01", "future"),
  ];

  it("includes those whose last change was a joining", () => {
    expect(rollAt(everyone, "2026-06-01").map((row) => row.personId)).toEqual([
      "stayer",
      "returner",
    ]);
  });

  it("excludes somebody who has left", () => {
    expect(rollAt(everyone, "2026-06-01").some((row) => row.personId === "leaver")).toBe(false);
  });

  it("included them before they left", () => {
    // The whole point: last year's roll stays knowable after a removal.
    expect(rollAt(everyone, "2024-02-29").some((row) => row.personId === "leaver")).toBe(true);
  });

  it("excludes an event dated after the day asked about", () => {
    expect(rollAt(everyone, "2026-06-01").some((row) => row.personId === "future")).toBe(false);
  });

  it("dates a returner from their restoration, not their baptism", () => {
    // "A member since 1998" is wrong for somebody who left in 2003.
    const entry = rollAt(everyone, "2026-06-01").find((row) => row.personId === "returner")!;
    expect(entry.since).toBe("2022-01-01");
    expect(entry.joined).toBe("RESTORED");
  });

  it("keeps somebody whose only events are decades old", () => {
    // Filtering by date before the walk is the mistake that makes an old roll
    // look empty.
    expect(rollAt([event("BAPTISM", "1970-01-01", "old")], "2026-01-01")).toHaveLength(1);
  });

  it("is empty before anybody joined", () => {
    expect(rollAt(everyone, "1990-01-01")).toEqual([]);
  });

  it("lists the longest-standing first", () => {
    const got = rollAt(everyone, "2026-06-01");
    expect(got.map((row) => row.since)).toEqual(["2015-01-01", "2022-01-01"]);
  });
});

describe("a roll revision", () => {
  const everyone = [
    event("BAPTISM", "2020-01-01", "a"),
    event("TRANSFER_IN", "2026-03-01", "b"),
    event("BAPTISM", "2026-01-01", "c"),
    event("DEATH", "2026-07-01", "a"),
    event("TRANSFER_IN", "2019-01-01", "d"),
  ];

  const year = () => revision(everyone, "2026-01-01", "2026-12-31");

  it("counts the roll as it was before the span started", () => {
    // A joining on the first day belongs to the movements, not to what was
    // already there.
    expect(year().openingCount).toBe(2);
  });

  it("lists who came in and who went out", () => {
    expect(year().joined.map((row) => row.personId)).toEqual(["c", "b"]);
    expect(year().left.map((row) => row.personId)).toEqual(["a"]);
  });

  it("counts the roll at the end", () => {
    expect(year().closingCount).toBe(3);
  });

  it("gives the net change, negative when the church shrank", () => {
    expect(year().net).toBe(1);
    expect(revision(everyone, "2026-07-01", "2026-12-31").net).toBe(-1);
  });

  it("closes: opening plus in less out is closing", () => {
    expect(year().reconciles).toBe(true);
  });

  it("closes over a span where nothing happened", () => {
    const quiet = revision(everyone, "2021-01-01", "2021-12-31");
    expect(quiet.openingCount).toBe(2);
    expect(quiet.closingCount).toBe(2);
    expect(quiet.reconciles).toBe(true);
  });

  it("closes when somebody joins on the very first day", () => {
    const got = revision(everyone, "2026-01-01", "2026-01-31");
    expect(got.openingCount).toBe(2);
    expect(got.joined).toHaveLength(1);
    expect(got.closingCount).toBe(3);
    expect(got.reconciles).toBe(true);
  });

  it("closes when somebody leaves on the very last day", () => {
    const got = revision(everyone, "2026-01-01", "2026-07-01");
    expect(got.left).toHaveLength(1);
    expect(got.reconciles).toBe(true);
  });
});

describe("counting by route", () => {
  it("counts each change separately", () => {
    const counts = byRoute([
      { change: "BAPTISM" },
      { change: "BAPTISM" },
      { change: "TRANSFER_IN" },
      { change: "DEATH" },
    ]);
    expect(counts.BAPTISM).toBe(2);
    expect(counts.TRANSFER_IN).toBe(1);
    expect(counts.DEATH).toBe(1);
  });

  it("gives a zero for every route, so the table has no holes", () => {
    const counts = byRoute([]);
    expect(counts.LAPSED).toBe(0);
    expect(Object.keys(counts)).toHaveLength(8);
  });
});

describe("what may go on a noticeboard", () => {
  it("gives the date they joined and nothing about why anybody left", () => {
    const entry = { personId: "p1", since: "2015-01-01", joined: "BAPTISM" } as const;
    const shown = publicEntry(entry);
    expect(shown).toEqual({ personId: "p1", since: "2015-01-01" });
    expect(Object.keys(shown)).not.toContain("joined");
  });
});
