import type { GroupMemberStatus, GroupRole } from "@prisma/client";

/**
 * Small groups: the rules, with no database anywhere near them.
 *
 * One decision runs through this whole feature and is worth stating on its
 * own: **a group that meets in somebody's living room must never publish where
 * they live.** So a group has two "where" fields — `area`, which is a district
 * and safe to print, and `address`, which is a house and is given only to
 * people actually in the group. `presentGroup` below is the only thing allowed
 * to decide which, and the type it returns has no unconditional `address` on
 * it, so a page cannot print one by forgetting.
 *
 * Getting that wrong once is not recoverable: an address that has been on the
 * open internet stays somewhere for good.
 */

export type GroupRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  meetsWhen: string | null;
  area: string | null;
  address: string | null;
  published: boolean;
  openToJoin: boolean;
  capacity: number | null;
  waitlist: boolean;
};

export type MemberRow = {
  userId: string;
  role: GroupRole;
  status: GroupMemberStatus;
};

export type GroupViewer = {
  userId: string | null;
  /** Whether they keep the group list (`manage_events`, or an admin). */
  manages: boolean;
};

/** How this viewer stands in relation to one group. */
export type Standing = "none" | "requested" | "waitlisted" | "member" | "leader" | "declined";

export function standingIn(members: readonly MemberRow[], viewer: GroupViewer): Standing {
  if (viewer.userId === null) return "none";
  const mine = members.find((member) => member.userId === viewer.userId);
  if (!mine) return "none";
  if (mine.status === "REQUESTED") return "requested";
  if (mine.status === "WAITLIST") return "waitlisted";
  if (mine.status === "DECLINED") return "declined";
  return mine.role === "LEADER" ? "leader" : "member";
}

/** People actually in the group — the ones a capacity counts. */
export function activeMembers(members: readonly MemberRow[]): MemberRow[] {
  return members.filter((member) => member.status === "ACTIVE");
}

/**
 * Whether somebody in this group may be given the address.
 *
 * Being *asked to join* is not enough, and that is the point: a request is
 * unanswered, so honouring it would mean anybody with an account could learn
 * where a leader lives by pressing a button. A leader answering is what turns
 * a stranger into somebody who is coming.
 */
export function canSeeAddress(standing: Standing, viewer: GroupViewer): boolean {
  if (viewer.manages) return true;
  // Neither "requested" nor "waitlisted" qualifies, and the waiting list makes
  // that matter more rather than less: a name on it is somebody nobody has
  // agreed to yet, sitting there for weeks.
  return standing === "member" || standing === "leader";
}

/** Whether a leader of this group may act on its requests. */
export function canLead(standing: Standing, viewer: GroupViewer): boolean {
  return viewer.manages || standing === "leader";
}

export type JoinState =
  | "open"
  /** Full, but it takes names — asking puts them on the list. */
  | "waitlist"
  /** Full, and it doesn't. */
  | "full"
  | "closed"
  | "already"
  /** Their ask is in front of the leader. */
  | "waiting"
  /** Their name is down, but the group was full when they asked. */
  | "on-waitlist"
  | "signed-out";

/**
 * Whether this viewer may ask to join, and if not, why not.
 *
 * "Full" is a real answer worth publishing rather than hiding the group: the
 * question somebody has is "can I come", and "not this one, it's full" answers
 * it.
 */
export function joinState(
  group: Pick<GroupRow, "openToJoin" | "capacity" | "waitlist">,
  members: readonly MemberRow[],
  viewer: GroupViewer,
): JoinState {
  const standing = standingIn(members, viewer);
  if (standing === "member" || standing === "leader") return "already";
  if (standing === "requested") return "waiting";
  if (standing === "waitlisted") return "on-waitlist";
  if (viewer.userId === null) return "signed-out";
  // Closed comes before full: a group that isn't taking anybody isn't taking
  // names for later either, and "it's full" would invite them to wait for a
  // place that would not be offered.
  if (!group.openToJoin) return "closed";
  if (placesLeft(group, members) === 0) return group.waitlist ? "waitlist" : "full";
  return "open";
}

/**
 * Places going spare, or null when the group has no stated size.
 *
 * **An unanswered request holds a place.** That is not obvious and it is not
 * how the first version counted: a request is not somebody in the group, so
 * counting only active members reads as the honest number. It is wrong, and a
 * database test is what showed it — promoting somebody to *requested* leaves
 * the active count unchanged, so the next run of the promoter sees the same
 * free place and offers it again, and the run after that, until the waiting
 * list is empty and eight people have each been told a place is theirs.
 *
 * A place is held from the moment it is offered to somebody until they are in
 * or they are turned down. Declining gives it straight back — see the requests
 * route, which promotes again on a no.
 *
 * `memberCount` on a group is still the *active* count, because that is the
 * answer to "how many people are in this group".
 */
export function placesLeft(
  group: Pick<GroupRow, "capacity">,
  members: readonly MemberRow[],
): number | null {
  if (group.capacity === null) return null;
  const holding = members.filter(
    (member) => member.status === "ACTIVE" || member.status === "REQUESTED",
  ).length;
  return Math.max(0, group.capacity - holding);
}

/** People waiting, longest first — the order a place is offered in. */
export function waitingList<T extends MemberRow & { createdAt: Date }>(members: readonly T[]): T[] {
  return members
    .filter((member) => member.status === "WAITLIST")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/**
 * Who moves off the waiting list now that there is room.
 *
 * They move to *requested*, not straight in — the leader's yes is the thing the
 * address travels with, and a place opening is not that yes. So this answers
 * "whose ask should now be in front of the leader", and the number of them is
 * the number of places, because offering four people one place is how a
 * waiting list stops being believed.
 */
export function promotableFromWaitlist<T extends MemberRow & { createdAt: Date }>(
  waiting: readonly T[],
  left: number | null,
): T[] {
  const inOrder = waitingList(waiting);
  return left === null ? inOrder : inOrder.slice(0, Math.max(0, left));
}

export function joinMessage(state: JoinState): string {
  switch (state) {
    case "open":
      return "";
    case "full":
      return "This group is full at the moment.";
    case "waitlist":
      return "This group is full — put your name down and the leader will be in touch when a place comes up.";
    case "on-waitlist":
      return "You're on the waiting list. The leader will be in touch when a place comes up.";
    case "closed":
      return "This group isn't taking new people just now.";
    case "already":
      return "You're in this group.";
    case "waiting":
      return "You've asked to join — the leader will be in touch.";
    case "signed-out":
      return "Sign in to ask to join a group.";
  }
}

/** A group as somebody is allowed to see it. Note `address` is optional. */
export type VisibleGroup = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  meetsWhen: string | null;
  area: string | null;
  /** Present only for people in the group. Absent, not null, when withheld. */
  address?: string;
  openToJoin: boolean;
  capacity: number | null;
  memberCount: number;
  /** How many are waiting, which is a real answer to "is it worth asking". */
  waitingCount: number;
  standing: Standing;
  joinState: JoinState;
  /** Leaders' names, which are safe to publish — somebody has to be asked. */
  leaders: string[];
};

/**
 * A group, with the address in it only if this viewer may have it.
 *
 * The one place that decision is made. `VisibleGroup` deliberately has no
 * required `address`, so a page that forgets to check simply has nothing to
 * print rather than printing a house.
 */
export function presentGroup(
  group: GroupRow,
  members: readonly (MemberRow & { displayName: string })[],
  viewer: GroupViewer,
): VisibleGroup {
  const standing = standingIn(members, viewer);
  const leaders = members
    .filter((member) => member.role === "LEADER" && member.status === "ACTIVE")
    .map((member) => member.displayName);

  return {
    id: group.id,
    slug: group.slug,
    name: group.name,
    description: group.description,
    meetsWhen: group.meetsWhen,
    area: group.area,
    ...(canSeeAddress(standing, viewer) && group.address ? { address: group.address } : {}),
    openToJoin: group.openToJoin,
    capacity: group.capacity,
    memberCount: activeMembers(members).length,
    waitingCount: members.filter((member) => member.status === "WAITLIST").length,
    standing,
    joinState: joinState(group, members, viewer),
    leaders,
  };
}
