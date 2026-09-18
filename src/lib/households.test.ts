import { describe, it, expect } from "vitest";
import {
  ageOn,
  canSeeAddress,
  childrenOf,
  daysUntilAnniversary,
  guardiansOf,
  inReadingOrder,
  isOfHousehold,
  mayCollect,
  presentHousehold,
  suggestName,
  upcomingOccasions,
  type HouseholdMember,
  type HouseholdRow,
} from "./households";
import type { IsoDate } from "./dates";

const adult = (id: string, name: string, dob: string | null, userId: string | null = null): HouseholdMember => ({
  id, displayName: name, householdRole: "ADULT", dateOfBirth: dob as IsoDate | null, userId, active: true,
});
const child = (id: string, name: string, dob: string | null): HouseholdMember => ({
  id, displayName: name, householdRole: "CHILD", dateOfBirth: dob as IsoDate | null, userId: null, active: true,
});

const ruth = adult("p1", "Ruth Bell", "1986-04-02", "u-ruth");
const sam = adult("p2", "Sam Bell", "1984-11-30", "u-sam");
const gran = adult("p3", "Edna Bell", "1948-01-09");
const mia = child("p4", "Mia Bell", "2019-06-14");
const jo = child("p5", "Jo Bell", "2022-02-01");
const members = [ruth, sam, gran, mia, jo];

const household: HouseholdRow = {
  id: "h1",
  name: "The Bells",
  address: "12 Elm Row",
  primaryContactId: "p1",
  anniversary: "2010-08-21" as IsoDate,
  notes: "Ring the top bell",
};

const today = "2026-09-18" as IsoDate;
const office = { userId: "u-staff", manages: true };
const inFamily = { userId: "u-ruth", manages: false };
const otherMember = { userId: "u-other", manages: false };
const signedOut = { userId: null, manages: false };

describe("isOfHousehold", () => {
  it("is somebody whose account is one of the members'", () => {
    expect(isOfHousehold(members, inFamily)).toBe(true);
    expect(isOfHousehold(members, otherMember)).toBe(false);
    expect(isOfHousehold(members, signedOut)).toBe(false);
  });
});

describe("canSeeAddress", () => {
  it("is the household and the office, and nobody else", () => {
    expect(canSeeAddress(members, office)).toBe(true);
    expect(canSeeAddress(members, inFamily)).toBe(true);
    expect(canSeeAddress(members, otherMember)).toBe(false);
    expect(canSeeAddress(members, signedOut)).toBe(false);
  });
});

describe("guardiansOf and childrenOf", () => {
  it("splits the household the way collection does", () => {
    expect(guardiansOf(members).map((m) => m.id)).toEqual(["p1", "p2", "p3"]);
    expect(childrenOf(members).map((m) => m.id)).toEqual(["p4", "p5"]);
  });

  it("drops somebody who has left, on both sides", () => {
    const gone = members.map((m) => (m.id === "p2" ? { ...m, active: false } : m));
    expect(guardiansOf(gone).map((m) => m.id)).toEqual(["p1", "p3"]);
    const movedOut = members.map((m) => (m.id === "p4" ? { ...m, active: false } : m));
    expect(childrenOf(movedOut).map((m) => m.id)).toEqual(["p5"]);
  });
});

describe("mayCollect", () => {
  it("lets any adult of the household collect any of its children", () => {
    expect(mayCollect("p1", "p4", members)).toBe(true);
    expect(mayCollect("p2", "p4", members)).toBe(true);
    // The grandparent who lives with them, not only the primary contact.
    expect(mayCollect("p3", "p5", members)).toBe(true);
  });

  it("refuses somebody who is not in the household at all", () => {
    expect(mayCollect("stranger", "p4", members)).toBe(false);
  });

  it("refuses an adult who has left the household", () => {
    // The whole point of the rule: leaving takes the permission with it.
    const gone = members.map((m) => (m.id === "p2" ? { ...m, active: false } : m));
    expect(mayCollect("p2", "p4", gone)).toBe(false);
  });

  it("refuses a child collecting another child", () => {
    expect(mayCollect("p4", "p5", members)).toBe(false);
  });

  it("refuses anybody collecting themselves", () => {
    expect(mayCollect("p4", "p4", members)).toBe(false);
    expect(mayCollect("p1", "p1", members)).toBe(false);
  });

  it("refuses collecting an adult, who is not check-in's business", () => {
    expect(mayCollect("p1", "p2", members)).toBe(false);
  });

  it("refuses collecting a child who has left", () => {
    const gone = members.map((m) => (m.id === "p4" ? { ...m, active: false } : m));
    expect(mayCollect("p1", "p4", gone)).toBe(false);
  });
});

describe("inReadingOrder", () => {
  it("puts adults first, each group oldest first", () => {
    expect(inReadingOrder(members).map((m) => m.id)).toEqual(["p3", "p2", "p1", "p4", "p5"]);
  });

  it("puts somebody with no birth date last within their own group, not first", () => {
    const unknown = adult("p6", "Alex Bell", null);
    expect(inReadingOrder([...members, unknown]).map((m) => m.id)).toEqual(["p3", "p2", "p1", "p6", "p4", "p5"]);
  });

  it("does not mutate what it was given", () => {
    const before = members.map((m) => m.id);
    inReadingOrder(members);
    expect(members.map((m) => m.id)).toEqual(before);
  });
});

describe("ageOn", () => {
  it("counts whole years", () => {
    expect(ageOn("2019-06-14" as IsoDate, today)).toBe(7);
    expect(ageOn("1986-04-02" as IsoDate, today)).toBe(40);
  });

  it("does not count a birthday that hasn't happened yet this year", () => {
    expect(ageOn("2019-12-25" as IsoDate, today)).toBe(6);
  });

  it("counts the birthday itself", () => {
    expect(ageOn("2019-09-18" as IsoDate, today)).toBe(7);
    expect(ageOn("2019-09-19" as IsoDate, today)).toBe(6);
  });

  it("is null when nobody has said, and for a date in the future", () => {
    expect(ageOn(null, today)).toBeNull();
    expect(ageOn("2030-01-01" as IsoDate, today)).toBeNull();
  });
});

describe("daysUntilAnniversary", () => {
  it("counts today as nought", () => {
    expect(daysUntilAnniversary("1990-09-18" as IsoDate, today)).toBe(0);
  });

  it("counts forward within the year", () => {
    expect(daysUntilAnniversary("1990-09-25" as IsoDate, today)).toBe(7);
  });

  it("rolls a date that has passed round to next year", () => {
    // 2026-09-18 → 2027-01-09
    expect(daysUntilAnniversary("1948-01-09" as IsoDate, today)).toBe(113);
  });

  it("is null when the next one is past the window", () => {
    expect(daysUntilAnniversary("1948-01-09" as IsoDate, today, 30)).toBeNull();
  });

  it("gives 29 February a day in a common year rather than skipping it", () => {
    // Never sending the card at all is the alternative.
    expect(daysUntilAnniversary("2000-02-29" as IsoDate, "2027-02-27" as IsoDate)).toBe(2);
    expect(daysUntilAnniversary("2000-02-29" as IsoDate, "2028-02-27" as IsoDate)).toBe(2);
  });
});

describe("upcomingOccasions", () => {
  const withMembers = [{ ...household, members }];

  it("finds birthdays and the household's anniversary, soonest first", () => {
    const found = upcomingOccasions(withMembers, "2026-05-28" as IsoDate, 120);
    expect(found.map((o) => [o.who, o.kind, o.inDays])).toEqual([
      ["Mia Bell", "birthday", 17],
      ["The Bells", "anniversary", 85],
    ]);
  });

  it("says which birthday it is", () => {
    const [mias] = upcomingOccasions(withMembers, "2026-06-01" as IsoDate, 30);
    expect(mias.turning).toBe(7);
  });

  it("includes children — the card most reliably appreciated", () => {
    const found = upcomingOccasions(withMembers, "2026-01-25" as IsoDate, 10);
    expect(found.map((o) => o.who)).toEqual(["Jo Bell"]);
  });

  it("skips somebody who has left, and anyone with no date", () => {
    const quiet = [{ ...household, members: members.map((m) => (m.id === "p4" ? { ...m, active: false } : m)) }];
    expect(upcomingOccasions(quiet, "2026-06-01" as IsoDate, 30)).toEqual([]);
    const undated = [{ ...household, anniversary: null, members: [adult("x", "No Date", null)] }];
    expect(upcomingOccasions(undated, today, 365)).toEqual([]);
  });
});

describe("presentHousehold", () => {
  it("gives the household and the office the address", () => {
    expect(presentHousehold(household, members, office, today).address).toBe("12 Elm Row");
    expect(presentHousehold(household, members, inFamily, today).address).toBe("12 Elm Row");
  });

  it("gives nobody else an address at all — absent, not null", () => {
    const seen = presentHousehold(household, members, otherMember, today);
    expect("address" in seen).toBe(false);
    expect(JSON.stringify(seen)).not.toContain("Elm Row");
  });

  it("keeps the office's notes for the office", () => {
    expect(presentHousehold(household, members, office, today).notes).toBe("Ring the top bell");
    expect("notes" in presentHousehold(household, members, inFamily, today)).toBe(false);
  });

  it("never lets a birth date out — an age is what a page needs", () => {
    const seen = presentHousehold(household, members, office, today);
    expect(JSON.stringify(seen)).not.toContain("2019-06-14");
    expect(seen.members.find((m) => m.id === "p4")?.age).toBe(7);
  });

  it("leaves the age off entirely when nobody has said", () => {
    const seen = presentHousehold(household, [adult("x", "Alex", null)], office, today);
    expect("age" in seen.members[0]).toBe(false);
  });

  it("lists the members in reading order", () => {
    expect(presentHousehold(household, members, office, today).members.map((m) => m.id))
      .toEqual(["p3", "p2", "p1", "p4", "p5"]);
  });
});

describe("suggestName", () => {
  it("uses a shared surname", () => {
    expect(suggestName([{ displayName: "Ruth Bell" }, { displayName: "Sam Bell" }])).toBe("The Bells");
  });

  it("pluralises a surname that already ends in s", () => {
    expect(suggestName([{ displayName: "Ana Rivers" }, { displayName: "Leo Rivers" }])).toBe("The Riverses");
  });

  it("falls back to first names when the surnames differ", () => {
    expect(suggestName([{ displayName: "Ruth Bell" }, { displayName: "Sam Okonkwo" }])).toBe("Ruth & Sam");
  });

  it("copes with one name, no surname, and nobody at all", () => {
    expect(suggestName([{ displayName: "Ruth" }])).toBe("Ruth");
    expect(suggestName([])).toBe("");
  });

  it("counts the rest rather than listing five names", () => {
    expect(suggestName([
      { displayName: "Ruth Bell" }, { displayName: "Sam Okonkwo" },
      { displayName: "Mia Bell" }, { displayName: "Jo Bell" },
    ])).toBe("Ruth, Sam & 2 more");
  });
});
