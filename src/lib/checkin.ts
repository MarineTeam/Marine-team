import { ageOn, guardiansOf, mayCollect, type HouseholdMember } from "@/lib/households";
import type { IsoDate } from "@/lib/dates";

/**
 * Children's check-in — the rules, with no database anywhere near them.
 *
 * Everything else in this app protects information. This protects a child, and
 * the difference shows in how the rules are shaped: there is no "probably", no
 * partial credit, and every refusal says which rule refused so a volunteer can
 * explain it to a parent standing in front of them.
 *
 * The release rule is the whole feature:
 *
 *   **Two independent things must agree before a child is handed over** — the
 *   code on the adult's ticket must match the one on the child's label, *and*
 *   the adult must be an adult of that child's own household. Either alone is
 *   a known way to lose a child. A code is a piece of paper, and pieces of
 *   paper are dropped, photographed and handed to the wrong person. A face is
 *   recognised wrongly under pressure by tired people every week.
 *
 * There is a third path, and it is deliberate: a leader may override, and the
 * override demands a written reason and records who gave it. Without one, a
 * desk facing a real situation the rules didn't anticipate — an aunt, a social
 * worker, a parent whose phone has died — will simply hand the child over
 * anyway and write nothing down. An override that is expected, awkward and
 * recorded is safer than a rule that gets quietly ignored.
 *
 * The code is per household per session, not per child: two siblings in two
 * rooms carry one code between them, so a parent has one ticket and a
 * volunteer has one thing to compare.
 */

/** The alphabet a code is drawn from: no O/0, I/1, S/5 — it is read aloud and typed in a hurry. */
export const CODE_ALPHABET = "ACDEFHJKMNPQRTUVWXYZ2346789";
export const CODE_LENGTH = 4;

/** A code from random bytes. Short on purpose — see the model comment. */
export function codeFromBytes(bytes: Uint8Array): string {
  let code = "";
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[bytes[index % bytes.length] % CODE_ALPHABET.length];
  }
  return code;
}

/**
 * What somebody typed, as a code.
 *
 * Upper-cased and stripped of everything that isn't in the alphabet, with the
 * lookalikes folded in: a volunteer reading `0` off a sticker that says `O`
 * must not be told the code is wrong.
 */
const LOOKALIKES: Record<string, string> = {
  "0": "Q",
  O: "Q",
  "1": "7",
  I: "7",
  L: "7",
  "5": "6",
  S: "6",
  B: "8",
  G: "6",
};

export function normalizeCode(raw: string): string {
  return [...raw.toUpperCase().replace(/[^A-Z0-9]/g, "")]
    .map((character) => (CODE_ALPHABET.includes(character) ? character : (LOOKALIKES[character] ?? character)))
    .filter((character) => CODE_ALPHABET.includes(character))
    .join("");
}

export function codesMatch(presented: string, onFile: string): boolean {
  const left = normalizeCode(presented);
  return left.length === CODE_LENGTH && left === normalizeCode(onFile);
}

export type Session = {
  id: string;
  name: string;
  date: IsoDate;
  room: string | null;
  minAge: number | null;
  maxAge: number | null;
  closedAt: Date | null;
};

export type Record_ = {
  id: string;
  childId: string;
  securityCode: string;
  checkedOutAt: Date | null;
};

export type Eligibility =
  | { ok: true; note?: string }
  | { ok: false; reason: string };

/**
 * Whether this child belongs in this room.
 *
 * A child whose birth date nobody has typed is **let in with a note**, never
 * refused. The alternative is a volunteer at 10:28 on a Sunday being told to
 * go and find an office record, with a queue behind them — which ends in the
 * rule being worked around rather than followed.
 */
export function eligibility(session: Session, dateOfBirth: IsoDate | null, today: IsoDate): Eligibility {
  if (session.minAge === null && session.maxAge === null) return { ok: true };

  const age = ageOn(dateOfBirth, today);
  if (age === null) return { ok: true, note: "No birthday on file — check this is the right room." };

  if (session.minAge !== null && age < session.minAge) {
    return { ok: false, reason: `This room is for ${session.minAge} and over; they're ${age}.` };
  }
  if (session.maxAge !== null && age > session.maxAge) {
    return { ok: false, reason: `This room is for up to ${session.maxAge}; they're ${age}.` };
  }
  return { ok: true };
}

export type CheckinRefusal =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Whether this child may be signed in here at all.
 *
 * Deliberately separate from `eligibility`: being the wrong age for a room is
 * a conversation, and being already checked in or arriving at a closed session
 * is a fact. The desk shows them differently.
 */
export function canCheckIn(
  session: Session,
  child: HouseholdMember,
  existing: Record_ | null,
): CheckinRefusal {
  if (session.closedAt) return { ok: false, reason: "This session has closed." };
  if (!child.active) return { ok: false, reason: `${child.displayName} isn't on the list any more.` };
  if (child.householdRole !== "CHILD") {
    return { ok: false, reason: `${child.displayName} isn't recorded as a child of this household.` };
  }
  if (existing && !existing.checkedOutAt) {
    return { ok: false, reason: `${child.displayName} is already signed in.` };
  }
  return { ok: true };
}

export type ReleaseOutcome =
  /** Both halves agreed. The ordinary way a child goes home. */
  | { ok: true; by: "code-and-guardian" }
  /** A leader took responsibility, in writing. */
  | { ok: true; by: "override"; reason: string }
  | { ok: false; reason: string; code: ReleaseRefusal };

export type ReleaseRefusal =
  | "not-checked-in"
  | "already-collected"
  | "wrong-code"
  | "not-a-guardian"
  | "override-needs-reason";

/**
 * Whether this child may be handed over, and if not, exactly why.
 *
 * The two checks are made independently and both must pass. They are *not*
 * short-circuited into one message: a volunteer needs to know whether the
 * problem is the ticket or the person, because those are different
 * conversations and only one of them is solved by finding a bit of paper.
 */
export function releaseDecision(input: {
  record: Record_ | null;
  presentedCode: string;
  collectorId: string | null;
  members: readonly HouseholdMember[];
  /** A leader's written reason, when they are overriding the answer above. */
  override?: { by: string; reason: string } | null;
}): ReleaseOutcome {
  const { record, presentedCode, collectorId, members, override } = input;

  if (!record) return { ok: false, reason: "That child isn't signed in here.", code: "not-checked-in" };
  if (record.checkedOutAt) {
    return { ok: false, reason: "They have already been collected.", code: "already-collected" };
  }

  if (override) {
    const reason = override.reason.trim();
    if (!reason) {
      // An override with no reason is the thing this feature exists to
      // prevent, so it is refused rather than recorded as a blank.
      return { ok: false, reason: "An override has to say why.", code: "override-needs-reason" };
    }
    return { ok: true, by: "override", reason };
  }

  if (!codesMatch(presentedCode, record.securityCode)) {
    return { ok: false, reason: "That code doesn't match the one on their label.", code: "wrong-code" };
  }
  if (!collectorId || !mayCollect(collectorId, record.childId, members)) {
    return {
      ok: false,
      reason: "Only an adult of this child's household can collect them. A leader can override this.",
      code: "not-a-guardian",
    };
  }
  return { ok: true, by: "code-and-guardian" };
}

export type LabelSet = {
  /** Goes on the child. Deliberately has nowhere to put a medical note. */
  child: { name: string; code: string; session: string; room: string | null };
  /** Goes to whoever brought them, and is what they bring back. */
  pickup: { code: string; session: string; children: string[] };
};

/**
 * What the printer produces for one family, one session.
 *
 * The child's label deliberately carries **no** medical note and no surname —
 * it is on a coat, in a corridor, readable by anyone walking past. What it
 * carries is a first name, a code, and the room. The medical note goes to the
 * room's register, on a screen, which is where somebody can actually act on it.
 */
export function labelsFor(
  session: Session,
  code: string,
  children: readonly { displayName: string; note?: string | null }[],
): LabelSet {
  const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
  return {
    child: {
      name: children.map((child) => firstName(child.displayName)).join(", "),
      code,
      session: session.name,
      room: session.room,
    },
    pickup: {
      code,
      session: session.name,
      children: children.map((child) => firstName(child.displayName)),
    },
  };
}

/** Who this family may send to collect, for the desk to show. */
export function collectorsFor(members: readonly HouseholdMember[]): HouseholdMember[] {
  return guardiansOf(members);
}

/** Children still in the room — the list that has to be empty before anybody goes home. */
export function stillHere<T extends { checkedOutAt: Date | null }>(records: readonly T[]): T[] {
  return records.filter((record) => record.checkedOutAt === null);
}
