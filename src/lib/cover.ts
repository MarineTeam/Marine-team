import { isBlockedOut } from "@/lib/rota";

/**
 * "I can't do Sunday — can somebody take it?"
 *
 * The rota already models an ask and an answer. What it had no word for is the
 * thing that happens most often after a yes: something comes up. Without it,
 * the whole exchange happens by text message and the rota goes on saying
 * somebody will be there who won't.
 *
 * The slot changes hands rather than a swap being recorded alongside it — see
 * the schema note — so everything here is about *when that is allowed*, which
 * is the part worth keeping out of a route handler and away from a database.
 */

export type CoverAssignment = {
  userId: string;
  status: string;
  coverWanted: boolean;
  plan: { serviceDate: Date | null; published: boolean };
};

export type AskOutcome = "ok" | "not-yours" | "declined" | "past" | "unpublished" | "already-asking";

/**
 * Whether this member may ask for cover on this assignment.
 *
 * A declined ask is excluded because there is nothing to cover: they already
 * said no, and whoever keeps the rota can see that. An *unanswered* one is
 * allowed, deliberately — "I've been asked and I can't, does anyone else want
 * it?" is a real thing to say, and making somebody accept first in order to
 * hand it on is a step that exists only to satisfy a state machine.
 */
export function canAskForCover(
  assignment: CoverAssignment,
  viewerId: string,
  now: Date = new Date(),
): AskOutcome {
  if (assignment.userId !== viewerId) return "not-yours";
  if (assignment.status === "DECLINED") return "declined";
  if (assignment.coverWanted) return "already-asking";
  if (!assignment.plan.published) return "unpublished";
  if (isPast(assignment.plan.serviceDate, now)) return "past";
  return "ok";
}

export type TakeState =
  | "open"
  | "yours"
  | "not-open"
  | "past"
  | "already-on"
  /** They can take it, but they told the rota they were away — see below. */
  | "away";

/**
 * Whether this member may take a slot somebody has asked to be covered.
 *
 * "away" is a *warning*, not a refusal. Somebody who put a blockout in and then
 * volunteers anyway has almost certainly changed their plans, and a rota that
 * argues with the person offering to help is a rota nobody helps with. What it
 * must not do is let them do it without noticing.
 *
 * "already-on" is a refusal, because the same person cannot be in two places:
 * the unique index on (plan, user, position) would reject the write anyway, and
 * a caught constraint error is not an explanation anybody can act on.
 */
export function coverState(
  assignment: CoverAssignment,
  viewer: { id: string; blockouts: { startDate: Date; endDate: Date }[] },
  alreadyOnThisPlan: boolean,
  now: Date = new Date(),
): TakeState {
  if (assignment.userId === viewer.id) return "yours";
  if (!assignment.coverWanted) return "not-open";
  if (isPast(assignment.plan.serviceDate, now)) return "past";
  if (alreadyOnThisPlan) return "already-on";
  if (isBlockedOut(viewer.blockouts, assignment.plan.serviceDate)) return "away";
  return "open";
}

/** Whether taking it should go through only after the taker has been warned. */
export function needsConfirming(state: TakeState): boolean {
  return state === "away";
}

export function canTake(state: TakeState): boolean {
  return state === "open" || state === "away";
}

/** What to show somebody who cannot take a slot, in words rather than a code. */
export function takeMessage(state: TakeState): string {
  switch (state) {
    case "open":
      return "";
    case "away":
      return "You told the rota you were away that day. Take it anyway?";
    case "yours":
      return "This one is yours.";
    case "not-open":
      return "Somebody has already taken this.";
    case "past":
      return "That service has been and gone.";
    case "already-on":
      return "You're already on for that service.";
  }
}

/**
 * A service with no date has not been scheduled yet, so it cannot be in the
 * past — and treating a missing date as "long ago" would quietly hide every
 * draft plan from the people it is being drafted for.
 */
function isPast(serviceDate: Date | null, now: Date): boolean {
  if (!serviceDate) return false;
  const endOfThatDay = new Date(serviceDate);
  endOfThatDay.setUTCHours(23, 59, 59, 999);
  return endOfThatDay.getTime() < now.getTime();
}

/**
 * Who asked, for the list other people see.
 *
 * Not `personName` from rota.ts, which falls back to the email address. That
 * fallback is right where a rota-builder needs to tell two Daves apart; it is
 * wrong here, where the list goes to everybody on the team and an address in
 * it is a small leak nobody asked for.
 */
export function askerName(user: { name: string | null; displayName: string | null }): string {
  return user.displayName?.trim() || user.name?.trim() || "Someone on your team";
}
