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
export type Standing = "none" | "requested" | "member" | "leader" | "declined";

export function standingIn(members: readonly MemberRow[], viewer: GroupViewer): Standing {
  if (viewer.userId === null) return "none";
  const mine = members.find((member) => member.userId === viewer.userId);
  if (!mine) return "none";
  if (mine.status === "REQUESTED") return "requested";
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
  return standing === "member" || standing === "leader";
}

/** Whether a leader of this group may act on its requests. */
export function canLead(standing: Standing, viewer: GroupViewer): boolean {
  return viewer.manages || standing === "leader";
}

export type JoinState = "open" | "full" | "closed" | "already" | "waiting" | "signed-out";

/**
 * Whether this viewer may ask to join, and if not, why not.
 *
 * "Full" is a real answer worth publishing rather than hiding the group: the
 * question somebody has is "can I come", and "not this one, it's full" answers
 * it.
 */
export function joinState(
  group: Pick<GroupRow, "openToJoin" | "capacity">,
  members: readonly MemberRow[],
  viewer: GroupViewer,
): JoinState {
  const standing = standingIn(members, viewer);
  if (standing === "member" || standing === "leader") return "already";
  if (standing === "requested") return "waiting";
  if (viewer.userId === null) return "signed-out";
  if (!group.openToJoin) return "closed";
  if (group.capacity !== null && activeMembers(members).length >= group.capacity) return "full";
  return "open";
}

export function joinMessage(state: JoinState): string {
  switch (state) {
    case "open":
      return "";
    case "full":
      return "This group is full at the moment.";
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
    standing,
    joinState: joinState(group, members, viewer),
    leaders,
  };
}
