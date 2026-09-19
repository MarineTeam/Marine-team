import { describe, it, expect } from "vitest";
import {
  bestOf,
  checkEntry,
  expiryLabel,
  isCleared,
  kindLabel,
  mayServe,
  needsChasing,
  refusalMessage,
  stateOf,
  type ClearanceRow,
} from "./clearance";

const TODAY = "2026-09-19";

const row = (over: Partial<ClearanceRow> = {}): ClearanceRow => ({
  kind: "BACKGROUND_CHECK",
  verifiedOn: "2025-09-19",
  expiresOn: "2027-09-19",
  withdrawnAt: null,
  ...over,
});

describe("stateOf", () => {
  it("counts a live record", () => {
    expect(stateOf(row(), TODAY)).toBe("current");
  });

  it("counts the expiry day itself", () => {
    // A certificate that says "valid until 1 March" is valid on 1 March. A
    // system that reads it as lapsing that morning is arguing with the
    // document in front of it.
    expect(stateOf(row({ expiresOn: TODAY }), TODAY)).toBe("expiring");
    expect(isCleared(stateOf(row({ expiresOn: TODAY }), TODAY))).toBe(true);
  });

  it("stops counting the day after", () => {
    expect(stateOf(row({ expiresOn: "2026-09-18" }), TODAY)).toBe("expired");
    expect(isCleared(stateOf(row({ expiresOn: "2026-09-18" }), TODAY))).toBe(false);
  });

  it("starts chasing inside the warning window, and not before", () => {
    expect(stateOf(row({ expiresOn: "2026-11-18" }), TODAY, 60)).toBe("expiring");
    expect(stateOf(row({ expiresOn: "2026-11-19" }), TODAY, 60)).toBe("current");
  });

  it("takes the window as given rather than assuming one", () => {
    expect(stateOf(row({ expiresOn: "2026-10-01" }), TODAY, 5)).toBe("current");
    expect(stateOf(row({ expiresOn: "2026-10-01" }), TODAY, 30)).toBe("expiring");
  });

  it("calls a withdrawal a withdrawal, not an expiry", () => {
    // They mean different things: one is a date nobody got to, the other is a
    // decision somebody made. A system that collapses them tells a later
    // enquiry the wrong story.
    const withdrawn = row({ withdrawnAt: new Date("2026-05-01T00:00:00Z") });
    expect(stateOf(withdrawn, TODAY)).toBe("withdrawn");
    expect(isCleared(stateOf(withdrawn, TODAY))).toBe(false);
  });

  it("says withdrawn even when the dates would still have been fine", () => {
    const withdrawn = row({ expiresOn: "2030-01-01", withdrawnAt: new Date("2026-05-01T00:00:00Z") });
    expect(stateOf(withdrawn, TODAY)).toBe("withdrawn");
  });

  it("calls nothing at all missing", () => {
    expect(stateOf(null, TODAY)).toBe("missing");
  });
});

describe("bestOf", () => {
  it("takes the one that lasts longest, not the one entered last", () => {
    // A church that renews early has somebody *more* cleared, not less.
    // Reading only the most recent row would let an early renewal shorten
    // somebody's standing.
    const rows = [
      row({ verifiedOn: "2026-09-01", expiresOn: "2027-01-01" }),
      row({ verifiedOn: "2024-01-01", expiresOn: "2029-01-01" }),
    ];
    expect(bestOf(rows, "BACKGROUND_CHECK")?.expiresOn).toBe("2029-01-01");
  });

  it("ignores a withdrawn row while a live one exists", () => {
    const rows = [
      row({ expiresOn: "2030-01-01", withdrawnAt: new Date("2026-01-01T00:00:00Z") }),
      row({ expiresOn: "2027-01-01" }),
    ];
    expect(bestOf(rows, "BACKGROUND_CHECK")?.expiresOn).toBe("2027-01-01");
  });

  it("lets a withdrawal speak when it is all there is", () => {
    // Otherwise withdrawing the only record would read as "missing" — close
    // enough in effect, but it loses the fact that somebody decided.
    const rows = [row({ withdrawnAt: new Date("2026-01-01T00:00:00Z") })];
    expect(bestOf(rows, "BACKGROUND_CHECK")?.withdrawnAt).not.toBeNull();
    expect(stateOf(bestOf(rows, "BACKGROUND_CHECK"), TODAY)).toBe("withdrawn");
  });

  it("does not answer with another kind's record", () => {
    expect(bestOf([row({ kind: "TRAINING" })], "BACKGROUND_CHECK")).toBeNull();
  });

  it("has nothing to say about an empty list", () => {
    expect(bestOf([], "BACKGROUND_CHECK")).toBeNull();
  });
});

describe("mayServe", () => {
  it("lets somebody on when everything required is current", () => {
    const verdict = mayServe({
      rows: [row(), row({ kind: "TRAINING", expiresOn: "2028-01-01" })],
      required: ["BACKGROUND_CHECK", "TRAINING"],
      today: TODAY,
    });
    expect(verdict.ok).toBe(true);
  });

  it("lets anybody on a team that requires nothing", () => {
    // Coffee does not need a criminal-records check, and a church that
    // requires one for everything ends up with a list nobody maintains.
    expect(mayServe({ rows: [], required: [], today: TODAY }).ok).toBe(true);
  });

  it("refuses when a required kind is missing entirely", () => {
    const verdict = mayServe({ rows: [], required: ["BACKGROUND_CHECK"], today: TODAY });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.failing).toEqual([{ kind: "BACKGROUND_CHECK", state: "missing" }]);
  });

  it("refuses on an expired one, however long it was valid before", () => {
    const verdict = mayServe({
      rows: [row({ verifiedOn: "2019-01-01", expiresOn: "2026-09-18" })],
      required: ["BACKGROUND_CHECK"],
      today: TODAY,
    });
    expect(verdict.ok).toBe(false);
  });

  it("refuses on a withdrawn one", () => {
    const verdict = mayServe({
      rows: [row({ withdrawnAt: new Date("2026-01-01T00:00:00Z") })],
      required: ["BACKGROUND_CHECK"],
      today: TODAY,
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.failing[0].state).toBe("withdrawn");
  });

  it("reports every failure, not just the first", () => {
    // Somebody chasing paperwork needs to know it is the check *and* the
    // references, rather than finding the second a week after sorting the
    // first.
    const verdict = mayServe({
      rows: [],
      required: ["BACKGROUND_CHECK", "REFERENCES", "TRAINING"],
      today: TODAY,
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.failing).toHaveLength(3);
  });

  it("lets somebody serve while their check is running out, and says how long", () => {
    // Refusing here would take a volunteer off the rota two months before
    // anything is actually wrong.
    const verdict = mayServe({
      rows: [row({ expiresOn: "2026-10-09" })],
      required: ["BACKGROUND_CHECK"],
      today: TODAY,
    });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.warnings).toEqual([{ kind: "BACKGROUND_CHECK", daysLeft: 20 }]);
  });

  it("warns about nothing when everything has a long way to run", () => {
    const verdict = mayServe({ rows: [row()], required: ["BACKGROUND_CHECK"], today: TODAY });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.warnings).toEqual([]);
  });

  it("ignores clearances of kinds the team doesn't ask for", () => {
    const verdict = mayServe({
      rows: [row({ kind: "TRAINING" })],
      required: ["BACKGROUND_CHECK"],
      today: TODAY,
    });
    expect(verdict.ok).toBe(false);
  });
});

describe("refusalMessage", () => {
  it("names one thing plainly", () => {
    expect(refusalMessage([{ kind: "BACKGROUND_CHECK", state: "missing" }])).toBe(
      "They can't be put on this team yet — no record of a criminal-records check.",
    );
  });

  it("reads as a sentence with several", () => {
    expect(
      refusalMessage([
        { kind: "BACKGROUND_CHECK", state: "expired" },
        { kind: "REFERENCES", state: "missing" },
      ]),
    ).toBe(
      "They can't be put on this team yet — a criminal-records check has expired and no record of references.",
    );
  });

  it("never says why something was withdrawn", () => {
    // The most sensitive thing this feature touches, and it does not belong in
    // an error on a rota screen read by whoever is scheduling that week.
    const message = refusalMessage([{ kind: "BACKGROUND_CHECK", state: "withdrawn" }]);
    expect(message).toContain("withdrawn");
    expect(message).not.toMatch(/because|reason|due to/i);
  });

  it("says nothing when nothing failed", () => {
    expect(refusalMessage([])).toBe("");
  });
});

describe("expiryLabel", () => {
  it("counts in days, which is what gets acted on", () => {
    expect(expiryLabel(row({ expiresOn: "2026-09-28" }), TODAY)).toBe("expires in 9 days");
    expect(expiryLabel(row({ expiresOn: "2026-09-20" }), TODAY)).toBe("expires in 1 day");
    expect(expiryLabel(row({ expiresOn: TODAY }), TODAY)).toBe("expires today");
  });

  it("says how long something has been wrong", () => {
    expect(expiryLabel(row({ expiresOn: "2026-09-18" }), TODAY)).toBe("expired 1 day ago");
    expect(expiryLabel(row({ expiresOn: "2026-09-09" }), TODAY)).toBe("expired 10 days ago");
  });

  it("says withdrawn rather than a date", () => {
    expect(expiryLabel(row({ withdrawnAt: new Date() }), TODAY)).toBe("withdrawn");
  });
});

describe("needsChasing", () => {
  it("puts the worst first — expired before merely expiring", () => {
    // Somebody whose check ran out in March is the most urgent person on the
    // list, not someone to write off.
    const rows = [
      row({ expiresOn: "2026-11-01" }),
      row({ expiresOn: "2026-03-01" }),
      row({ expiresOn: "2026-10-01" }),
    ];
    expect(needsChasing(rows, TODAY).map((r) => r.expiresOn)).toEqual([
      "2026-03-01",
      "2026-10-01",
      "2026-11-01",
    ]);
  });

  it("leaves out what has a long way to run", () => {
    expect(needsChasing([row({ expiresOn: "2028-01-01" })], TODAY)).toEqual([]);
  });

  it("leaves out a withdrawn one — it is a decision, not a job to chase", () => {
    expect(needsChasing([row({ expiresOn: "2026-10-01", withdrawnAt: new Date() })], TODAY)).toEqual([]);
  });
});

describe("checkEntry", () => {
  it("accepts an ordinary record", () => {
    expect(checkEntry({ verifiedOn: "2026-09-01", expiresOn: "2029-09-01", today: TODAY }).ok).toBe(true);
  });

  it("accepts one checked today", () => {
    expect(checkEntry({ verifiedOn: TODAY, expiresOn: "2029-09-01", today: TODAY }).ok).toBe(true);
  });

  it("refuses an expiry before the check", () => {
    expect(checkEntry({ verifiedOn: "2026-09-01", expiresOn: "2025-09-01", today: TODAY }).ok).toBe(false);
  });

  it("refuses one that expires the day it was checked", () => {
    expect(checkEntry({ verifiedOn: "2026-09-01", expiresOn: "2026-09-01", today: TODAY }).ok).toBe(false);
  });

  it("refuses a check dated in the future — the other typo", () => {
    expect(checkEntry({ verifiedOn: "2027-09-01", expiresOn: "2030-09-01", today: TODAY }).ok).toBe(false);
  });
});

describe("kindLabel", () => {
  it("reads as English inside a sentence, for every kind", () => {
    for (const kind of ["BACKGROUND_CHECK", "REFERENCES", "TRAINING"] as const) {
      expect(kindLabel(kind)).toMatch(/^[a-z]/);
    }
  });
});
