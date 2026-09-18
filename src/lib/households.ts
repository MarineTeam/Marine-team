import type { HouseholdRole } from "@prisma/client";
import { compareIsoDates, isoDateFromParts, type IsoDate } from "@/lib/dates";

/**
 * Families — the rules, with no database anywhere near them.
 *
 * The app had two tables of people and nothing for the unit most pastoral
 * questions are actually about. Who may collect this child, whose giving
 * statement is this, where does the Christmas card go: all household
 * questions, and each feature that needed one was inventing its own answer.
 *
 * Two rules in here carry real weight and are worth stating on their own.
 *
 *   1. **An address is given only to the household and to the office.** The
 *      same rule small groups make about a leader's house, for the same
 *      reason, and enforced the same way: `presentHousehold` returns a type
 *      with no unconditional `address` on it, so a page that forgets to check
 *      has nothing to print.
 *   2. **Only an adult of a child's own household may collect them.** That is
 *      the whole of what check-in is protecting, and it lives here rather than
 *      in the check-in code so it can be read, tested and broken on purpose in
 *      one place.
 *
 * Medical notes are handled the same way as an address and more strictly: they
 * are absent from every shape but the one the room is handed.
 */

export type HouseholdMember = {
  id: string;
  displayName: string;
  householdRole: HouseholdRole;
  dateOfBirth: IsoDate | null;
  /** The account, when this person has one. Most children do not. */
  userId: string | null;
  active: boolean;
};

export type HouseholdRow = {
  id: string;
  name: string;
  address: string | null;
  primaryContactId: string | null;
  anniversary: IsoDate | null;
  notes: string | null;
};

export type HouseholdViewer = {
  /** The signed-in member's account id, or null. */
  userId: string | null;
  /** Whether they keep the people list (`manage_people`, or an admin). */
  manages: boolean;
};

/** Whether this viewer is one of the people who live here. */
export function isOfHousehold(members: readonly HouseholdMember[], viewer: HouseholdViewer): boolean {
  if (viewer.userId === null) return false;
  return members.some((member) => member.userId === viewer.userId);
}

/**
 * Whether this viewer may be told where a household lives.
 *
 * The office, and the household itself. Not "anybody signed in", and not a
 * small group's leader who happens to have them on a list — an address is the
 * one field here that cannot be un-published once it has been seen.
 */
export function canSeeAddress(members: readonly HouseholdMember[], viewer: HouseholdViewer): boolean {
  return viewer.manages || isOfHousehold(members, viewer);
}

/**
 * The adults of this household: the people who may collect its children.
 *
 * Deliberately *not* "any adult who is signed in", and not the primary contact
 * alone — both parents collect, and so does the grandparent who lives with
 * them. Inactive people are excluded: somebody marked inactive has left, and
 * the whole point of the rule is that leaving takes the permission with it.
 */
export function guardiansOf(members: readonly HouseholdMember[]): HouseholdMember[] {
  return members.filter((member) => member.active && member.householdRole === "ADULT");
}

/** The children of this household — who check-in has anything to do with. */
export function childrenOf(members: readonly HouseholdMember[]): HouseholdMember[] {
  return members.filter((member) => member.active && member.householdRole === "CHILD");
}

/**
 * Whether this person may collect that child.
 *
 * One function, one answer, and the only thing check-in asks. Both must be in
 * the same household, the collector must be an adult of it, and neither may be
 * inactive. A child may not collect another child, and nobody may collect
 * themselves out of the room.
 */
export function mayCollect(
  collectorId: string,
  childId: string,
  members: readonly HouseholdMember[],
): boolean {
  if (collectorId === childId) return false;
  const child = members.find((member) => member.id === childId);
  if (!child || !child.active || child.householdRole !== "CHILD") return false;
  return guardiansOf(members).some((adult) => adult.id === collectorId);
}

/**
 * Members in the order a family is read: adults first, then children oldest
 * first, and anybody whose birthday nobody has typed at the end of their own
 * group rather than pretending to be the youngest.
 */
export function inReadingOrder(members: readonly HouseholdMember[]): HouseholdMember[] {
  const rank = (member: HouseholdMember) => (member.householdRole === "ADULT" ? 0 : 1);
  return [...members].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.dateOfBirth && b.dateOfBirth) return compareIsoDates(a.dateOfBirth, b.dateOfBirth);
    if (a.dateOfBirth) return -1;
    if (b.dateOfBirth) return 1;
    return a.displayName.localeCompare(b.displayName);
  });
}

/**
 * Whole years old on a given day, or null when nobody has said.
 *
 * Whole years, because that is what a room is graded by, and computed from the
 * date every time rather than stored — an age written down is wrong the next
 * day and nobody ever notices.
 */
export function ageOn(dateOfBirth: IsoDate | null, on: IsoDate): number | null {
  if (!dateOfBirth) return null;
  const [by, bm, bd] = dateOfBirth.split("-").map(Number);
  const [ny, nm, nd] = on.split("-").map(Number);
  let age = ny - by;
  if (nm < bm || (nm === bm && nd < bd)) age -= 1;
  return age < 0 ? null : age;
}

/**
 * Days until the next anniversary of a date, counting today as 0.
 *
 * The year is replaced rather than added to, so a birthday that has passed
 * rolls to next year on its own. 29 February falls on 1 March in a common
 * year: it is the answer a card needs, and never sending the card at all is
 * the alternative.
 */
export function daysUntilAnniversary(date: IsoDate, today: IsoDate, withinDays = 400): number | null {
  const [, month, day] = date.split("-").map(Number);
  const [thisYear] = today.split("-").map(Number);

  for (const year of [thisYear, thisYear + 1]) {
    const next = occurrenceIn(year, month, day);
    const away = daysBetween(today, next);
    if (away >= 0 && away <= withinDays) return away;
  }
  return null;
}

/**
 * The date this month-and-day falls on in a given year.
 *
 * 29 February in a common year needs no special case: `Date.UTC(y, 1, 29)`
 * *is* 1 March, which is the day a card should arrive and the answer the
 * arithmetic below already gives. A branch that spelled that out explicitly
 * lived here until a mutation test showed removing it changed nothing.
 */
function occurrenceIn(year: number, month: number, day: number): IsoDate {
  return isoDateFromParts(year, month, day);
}

function daysBetween(from: IsoDate, to: IsoDate): number {
  const at = (value: IsoDate) => {
    const [y, m, d] = value.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((at(to) - at(from)) / 86_400_000);
}

export type Occasion = {
  householdId: string;
  householdName: string;
  /** Whose birthday, or null for the household's own anniversary. */
  personId: string | null;
  who: string;
  kind: "birthday" | "anniversary";
  date: IsoDate;
  inDays: number;
  /** The birthday they are turning, when a birth year is known. */
  turning: number | null;
};

/**
 * Birthdays and anniversaries coming up, soonest first.
 *
 * The office's reason for keeping a birth date at all, and the reason the
 * field exists on a person rather than an age. Children are included — a card
 * for a seven-year-old is the most reliably appreciated thing a church does.
 */
export function upcomingOccasions(
  households: readonly (HouseholdRow & { members: readonly HouseholdMember[] })[],
  today: IsoDate,
  withinDays = 30,
): Occasion[] {
  const found: Occasion[] = [];

  for (const household of households) {
    for (const member of household.members) {
      if (!member.active || !member.dateOfBirth) continue;
      const inDays = daysUntilAnniversary(member.dateOfBirth, today, withinDays);
      if (inDays === null) continue;
      found.push({
        householdId: household.id,
        householdName: household.name,
        personId: member.id,
        who: member.displayName,
        kind: "birthday",
        date: member.dateOfBirth,
        inDays,
        turning: (ageOn(member.dateOfBirth, today) ?? -1) + 1 || null,
      });
    }

    if (household.anniversary) {
      const inDays = daysUntilAnniversary(household.anniversary, today, withinDays);
      if (inDays !== null) {
        found.push({
          householdId: household.id,
          householdName: household.name,
          personId: null,
          who: household.name,
          kind: "anniversary",
          date: household.anniversary,
          inDays,
          turning: (ageOn(household.anniversary, today) ?? -1) + 1 || null,
        });
      }
    }
  }

  return found.sort((a, b) => a.inDays - b.inDays || a.who.localeCompare(b.who));
}

/** A household as somebody is allowed to see it. Note `address` is optional. */
export type VisibleHousehold = {
  id: string;
  name: string;
  /** Present only for the household itself and the office. Absent, not null. */
  address?: string;
  /** The office's own notes, likewise. */
  notes?: string;
  anniversary: IsoDate | null;
  primaryContactId: string | null;
  members: VisibleMember[];
};

export type VisibleMember = {
  id: string;
  displayName: string;
  householdRole: HouseholdRole;
  active: boolean;
  /** Whole years, when a birth date is known — never the date itself. */
  age?: number;
};

/**
 * A household, with the address in it only if this viewer may have it.
 *
 * The one place that decision is made. The birth *date* never leaves here
 * either: what a page needs is an age, and a date of birth is an identity
 * document's worth of information to hand out so somebody can say "seven".
 */
export function presentHousehold(
  household: HouseholdRow,
  members: readonly HouseholdMember[],
  viewer: HouseholdViewer,
  today: IsoDate,
): VisibleHousehold {
  const allowed = canSeeAddress(members, viewer);
  return {
    id: household.id,
    name: household.name,
    ...(allowed && household.address ? { address: household.address } : {}),
    ...(viewer.manages && household.notes ? { notes: household.notes } : {}),
    anniversary: household.anniversary,
    primaryContactId: household.primaryContactId,
    members: inReadingOrder(members).map((member) => {
      const age = ageOn(member.dateOfBirth, today);
      return {
        id: member.id,
        displayName: member.displayName,
        householdRole: member.householdRole,
        active: member.active,
        ...(age === null ? {} : { age }),
      };
    }),
  };
}

/**
 * A name to offer for a new household, from the people going into it.
 *
 * A suggestion only, and the form keeps it editable: families do not share a
 * surname as reliably as software wishes they did, and guessing confidently is
 * worse than guessing visibly.
 */
export function suggestName(members: readonly { displayName: string }[]): string {
  const surnames = new Set(
    members
      .map((member) => member.displayName.trim().split(/\s+/).slice(1).join(" "))
      .filter(Boolean),
  );
  if (surnames.size === 1) {
    const [surname] = [...surnames];
    return `The ${surname}${/s$/i.test(surname) ? "es" : "s"}`;
  }
  const firsts = members.map((member) => member.displayName.trim().split(/\s+/)[0]).filter(Boolean);
  if (firsts.length === 0) return "";
  if (firsts.length <= 2) return firsts.join(" & ");
  return `${firsts.slice(0, 2).join(", ")} & ${firsts.length - 2} more`;
}
