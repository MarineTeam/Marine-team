import { describe, it, expect } from "vitest";
import {
  canCheckIn,
  CODE_ALPHABET,
  CODE_LENGTH,
  codeFromBytes,
  codesMatch,
  collectorsFor,
  eligibility,
  labelsFor,
  normalizeCode,
  releaseDecision,
  stillHere,
  type Record_,
  type Session,
} from "./checkin";
import type { HouseholdMember } from "./households";
import type { IsoDate } from "./dates";

const adult = (id: string, name: string): HouseholdMember => ({
  id, displayName: name, householdRole: "ADULT", dateOfBirth: null, userId: null, active: true,
});
const kid = (id: string, name: string, dob: string | null = null): HouseholdMember => ({
  id, displayName: name, householdRole: "CHILD", dateOfBirth: dob as IsoDate | null, userId: null, active: true,
});

const ruth = adult("a1", "Ruth Bell");
const gran = adult("a2", "Edna Bell");
const mia = kid("c1", "Mia Bell", "2019-06-14");
const jo = kid("c2", "Jo Bell", "2023-02-01");
const members = [ruth, gran, mia, jo];

const session: Session = {
  id: "s1", name: "Sunday 10:30", date: "2026-09-20" as IsoDate, room: "The Ark",
  minAge: 3, maxAge: 7, closedAt: null,
};
const record: Record_ = { id: "r1", childId: "c1", securityCode: "M4KP", checkedOutAt: null };
const today = "2026-09-20" as IsoDate;

describe("codes", () => {
  it("avoids the characters that are misread aloud", () => {
    for (const confusable of ["O", "0", "I", "1", "L", "S", "5", "B", "G"]) {
      expect(CODE_ALPHABET).not.toContain(confusable);
    }
  });

  it("makes a code of the right length from bytes", () => {
    const code = codeFromBytes(new Uint8Array([3, 40, 7, 19]));
    expect(code).toHaveLength(CODE_LENGTH);
    expect([...code].every((c) => CODE_ALPHABET.includes(c))).toBe(true);
  });

  it("is different for different bytes", () => {
    expect(codeFromBytes(new Uint8Array([1, 2, 3, 4]))).not.toBe(codeFromBytes(new Uint8Array([9, 8, 7, 6])));
  });

  it("forgives case, spaces and punctuation", () => {
    expect(normalizeCode(" m4-k p ")).toBe("M4KP");
  });

  it("folds the lookalikes a tired volunteer types", () => {
    // Reading Q off a sticker as O must not be told the code is wrong.
    expect(normalizeCode("O4KP")).toBe("Q4KP");
    expect(normalizeCode("04KP")).toBe("Q4KP");
    expect(normalizeCode("M4KB")).toBe("M4K8");
  });

  it("matches a code only at full length", () => {
    expect(codesMatch("m4kp", "M4KP")).toBe(true);
    expect(codesMatch("M4K", "M4KP")).toBe(false);
    expect(codesMatch("", "M4KP")).toBe(false);
    expect(codesMatch("M4KQ", "M4KP")).toBe(false);
  });
});

describe("eligibility", () => {
  it("lets a child of the right age in", () => {
    expect(eligibility(session, "2019-06-14" as IsoDate, today)).toEqual({ ok: true });
  });

  it("turns away somebody too young or too old, and says which", () => {
    const young = eligibility(session, "2024-01-01" as IsoDate, today);
    expect(young.ok).toBe(false);
    expect(young.ok === false && young.reason).toContain("3 and over");
    const old = eligibility(session, "2014-01-01" as IsoDate, today);
    expect(old.ok === false && old.reason).toContain("up to 7");
  });

  it("lets a child with no birthday in, with a note — never refuses them", () => {
    // A volunteer at 10:28 sent to find an office record works around the
    // rule instead of following it.
    const unknown = eligibility(session, null, today);
    expect(unknown.ok).toBe(true);
    expect(unknown.ok === true && unknown.note).toContain("No birthday");
  });

  it("asks nothing of a room with no age range", () => {
    expect(eligibility({ ...session, minAge: null, maxAge: null }, null, today)).toEqual({ ok: true });
  });
});

describe("canCheckIn", () => {
  it("allows an ordinary child", () => {
    expect(canCheckIn(session, mia, null)).toEqual({ ok: true });
  });

  it("refuses a closed session", () => {
    expect(canCheckIn({ ...session, closedAt: new Date() }, mia, null).ok).toBe(false);
  });

  it("refuses somebody already in the room", () => {
    expect(canCheckIn(session, mia, record).ok).toBe(false);
  });

  it("allows a child back in after they were collected", () => {
    expect(canCheckIn(session, mia, { ...record, checkedOutAt: new Date() })).toEqual({ ok: true });
  });

  it("refuses an adult, and somebody who has left", () => {
    expect(canCheckIn(session, ruth, null).ok).toBe(false);
    expect(canCheckIn(session, { ...mia, active: false }, null).ok).toBe(false);
  });
});

describe("releaseDecision — the rule the feature exists for", () => {
  const base = { record, presentedCode: "M4KP", collectorId: "a1", members };

  it("hands the child over when the code and the person both agree", () => {
    expect(releaseDecision(base)).toEqual({ ok: true, by: "code-and-guardian" });
  });

  it("refuses a right person with a wrong code", () => {
    const out = releaseDecision({ ...base, presentedCode: "XXXX" });
    expect(out).toMatchObject({ ok: false, code: "wrong-code" });
  });

  it("refuses a right code held by the wrong person", () => {
    // A code is a piece of paper, and pieces of paper get handed to people.
    const out = releaseDecision({ ...base, collectorId: "stranger" });
    expect(out).toMatchObject({ ok: false, code: "not-a-guardian" });
  });

  it("refuses a right code held by another child of the family", () => {
    expect(releaseDecision({ ...base, collectorId: "c2" })).toMatchObject({ ok: false, code: "not-a-guardian" });
  });

  it("names which half failed, rather than one blurred message", () => {
    expect(releaseDecision({ ...base, presentedCode: "XXXX" }).ok).toBe(false);
    const wrongCode = releaseDecision({ ...base, presentedCode: "XXXX" });
    const wrongPerson = releaseDecision({ ...base, collectorId: "stranger" });
    expect(wrongCode.ok === false && wrongCode.reason).not.toBe(wrongPerson.ok === false && wrongPerson.reason);
  });

  it("lets any adult of the household collect, not only the one who brought them", () => {
    expect(releaseDecision({ ...base, collectorId: "a2" })).toEqual({ ok: true, by: "code-and-guardian" });
  });

  it("refuses an adult who has left the household even with the right code", () => {
    const left = members.map((m) => (m.id === "a2" ? { ...m, active: false } : m));
    expect(releaseDecision({ ...base, collectorId: "a2", members: left })).toMatchObject({
      ok: false,
      code: "not-a-guardian",
    });
  });

  it("refuses a child who isn't signed in, or has already gone", () => {
    expect(releaseDecision({ ...base, record: null })).toMatchObject({ ok: false, code: "not-checked-in" });
    expect(releaseDecision({ ...base, record: { ...record, checkedOutAt: new Date() } })).toMatchObject({
      ok: false,
      code: "already-collected",
    });
  });

  it("lets a leader override, in writing", () => {
    const out = releaseDecision({
      ...base,
      presentedCode: "",
      collectorId: "stranger",
      override: { by: "leader@example.test", reason: "Aunt collecting; mum rang the office" },
    });
    expect(out).toEqual({ ok: true, by: "override", reason: "Aunt collecting; mum rang the office" });
  });

  it("refuses an override with no reason rather than recording a blank", () => {
    expect(
      releaseDecision({ ...base, override: { by: "leader@example.test", reason: "   " } }),
    ).toMatchObject({ ok: false, code: "override-needs-reason" });
  });

  it("will not override a child who was never signed in, or has gone already", () => {
    const override = { by: "leader@example.test", reason: "anything" };
    expect(releaseDecision({ ...base, record: null, override }).ok).toBe(false);
    expect(
      releaseDecision({ ...base, record: { ...record, checkedOutAt: new Date() }, override }).ok,
    ).toBe(false);
  });
});

describe("labelsFor", () => {
  const labels = labelsFor(session, "M4KP", [{ displayName: "Mia Bell" }, { displayName: "Jo Bell" }]);

  it("puts one code on both halves — a family has one ticket", () => {
    expect(labels.child.code).toBe("M4KP");
    expect(labels.pickup.code).toBe("M4KP");
  });

  it("uses first names only: a label is on a coat in a corridor", () => {
    expect(labels.child.name).toBe("Mia, Jo");
    expect(JSON.stringify(labels)).not.toContain("Bell");
  });

  it("has nowhere at all to put a medical note", () => {
    expect("note" in labels.child).toBe(false);
    expect(JSON.stringify(labels)).not.toMatch(/allerg|medical|epipen/i);
  });

  it("names the room, which is what a parent is looking for", () => {
    expect(labels.child.room).toBe("The Ark");
  });
});

describe("collectorsFor and stillHere", () => {
  it("offers the household's adults", () => {
    expect(collectorsFor(members).map((m) => m.id)).toEqual(["a1", "a2"]);
  });

  it("lists who is still in the room", () => {
    const rows = [
      { id: "1", checkedOutAt: null },
      { id: "2", checkedOutAt: new Date() },
      { id: "3", checkedOutAt: null },
    ];
    expect(stillHere(rows).map((r) => r.id)).toEqual(["1", "3"]);
  });
});
