import type { PrayerStatus, PrayerVisibility } from "@prisma/client";

/**
 * The prayer wall's rules.
 *
 * This is a moderation problem wearing a list, so the two decisions that
 * matter — *may this person see this* and *what may they be told about who
 * wrote it* — are one function each, here, pure, rather than a `where` clause
 * copied between four queries that will eventually disagree.
 *
 * Nothing in this file touches the database: `lib/prayer-query.ts` does the
 * reading, and the wall itself is a client component (see
 * `client-bundle.test.ts` for why that matters).
 *
 * The anonymity rule is the one to be careful about. A request marked
 * anonymous still knows whose it is — the writer has to be able to come back
 * and delete it, and a moderator has to be able to act if it is abusive — so
 * "anonymous" cannot be a missing column. It has to be a name that is never
 * put into an answer, which means exactly one function is allowed to decide
 * what a reader is told, and every read path goes through it.
 */

export type Viewer = {
  /** The reader's own user id, or null for somebody with no account. */
  userId: string | null;
  /** Whether they moderate the wall (`moderate_prayer`, or an admin). */
  moderates: boolean;
};

export const ANONYMOUS_LABEL = "Anonymous";

/** A request as it sits in the database, as far as these rules care. */
export type PrayerRow = {
  id: string;
  userId: string | null;
  name: string | null;
  body: string;
  anonymous: boolean;
  visibility: PrayerVisibility;
  status: PrayerStatus;
  answeredNote: string | null;
  answeredAt: Date | null;
  createdAt: Date;
};

/** A request as somebody is allowed to see it. Note there is no `userId`. */
export type VisiblePrayer = {
  id: string;
  /** The name to print, or ANONYMOUS_LABEL. Never an account, never an email. */
  by: string;
  body: string;
  status: PrayerStatus;
  answeredNote: string | null;
  answeredAt: string | null;
  createdAt: string;
  prayers: number;
  /** Whether this reader has already said they prayed. */
  prayed: boolean;
  /** Whether this reader may take it down — their own, or they moderate. */
  mine: boolean;
};

/**
 * Whether a reader may see a request at all.
 *
 * Written as one expression on purpose: every clause of it is a way somebody
 * could see something they shouldn't, and they belong where they can be read
 * together rather than spread across the queries that need them.
 */
export function canSee(request: PrayerRow, viewer: Viewer): boolean {
  // A moderator sees the queue, which is the job.
  if (viewer.moderates) return true;

  // Your own request is yours to see whatever state it is in — otherwise
  // writing one and waiting looks exactly like it having been thrown away.
  if (request.userId !== null && request.userId === viewer.userId) return true;

  // Everybody else sees only what has been let through.
  if (request.status !== "APPROVED" && request.status !== "ANSWERED") return false;

  switch (request.visibility) {
    case "EVERYONE":
      return true;
    case "MEMBERS":
      return viewer.userId !== null;
    case "LEADERS":
      // Already covered by the moderator check above; anybody else, no.
      return false;
  }
}

/**
 * What a reader is told about who wrote it.
 *
 * The single place any name is allowed to escape. A request marked anonymous
 * gets the label whoever is reading — including its own writer, who knows
 * anyway, and including a moderator, whose screen says separately that they
 * can look it up if they have to. Making the moderator's list say the name
 * inline is how a screenshot of that list ends up somewhere it shouldn't.
 */
export function bylineFor(request: Pick<PrayerRow, "anonymous" | "name">): string {
  if (request.anonymous) return ANONYMOUS_LABEL;
  return request.name?.trim() || ANONYMOUS_LABEL;
}

/**
 * A row as an answer, with everything a reader may not have removed.
 *
 * Takes the counts rather than fetching them, so it stays pure and so the
 * caller decides how they were counted.
 */
export function presentPrayer(
  request: PrayerRow,
  viewer: Viewer,
  counts: { prayers: number; prayed: boolean },
): VisiblePrayer {
  return {
    id: request.id,
    by: bylineFor(request),
    body: request.body,
    status: request.status,
    answeredNote: request.answeredNote,
    answeredAt: request.answeredAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
    prayers: counts.prayers,
    prayed: counts.prayed,
    mine: viewer.moderates || (request.userId !== null && request.userId === viewer.userId),
  };
}

/** Everything this reader may see, presented. */
export function visibleTo(
  requests: readonly (PrayerRow & { prayers: { userId: string }[] })[],
  viewer: Viewer,
): VisiblePrayer[] {
  return requests
    .filter((request) => canSee(request, viewer))
    .map((request) =>
      presentPrayer(request, viewer, {
        prayers: request.prayers.length,
        prayed:
          viewer.userId !== null &&
          request.prayers.some((intercession) => intercession.userId === viewer.userId),
      }),
    );
}

/**
 * Whether a reader may act on a request — pray for it, delete it.
 *
 * Deliberately not the same as `canSee`: a moderator can see the queue, but
 * pressing "I prayed for this" on something nobody has been shown yet would
 * make the count mean something different from what it says.
 */
export function canPrayFor(request: PrayerRow, viewer: Viewer): boolean {
  if (viewer.userId === null) return false;
  return request.status === "APPROVED" || request.status === "ANSWERED";
}

export function canDelete(request: PrayerRow, viewer: Viewer): boolean {
  if (viewer.moderates) return true;
  return request.userId !== null && request.userId === viewer.userId;
}
