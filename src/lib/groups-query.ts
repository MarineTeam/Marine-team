import { Prisma, type User } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  placesLeft,
  presentGroup,
  promotableFromWaitlist,
  type GroupViewer,
  type VisibleGroup,
} from "@/lib/groups";
import { notifySubscribers } from "@/lib/push";
import { hasCapability } from "@/lib/permissions";
import { getDisplayName } from "@/lib/profile";
import { uniqueSlug } from "@/lib/slug";

/**
 * Reading small groups.
 *
 * Separate from lib/groups.ts because the group pages are client components,
 * and a value imported from a module reaching Prisma bundles the whole client
 * into the browser — see client-bundle.test.ts.
 *
 * Every read here goes out through `presentGroup`, which is the only thing
 * allowed to decide whether an address travels with a group.
 */

const memberInclude = {
  members: {
    // Waitlisted rows are included so a viewer on the list is recognised as
    // being on it, and so the group can say how many are waiting. They take no
    // place — `activeMembers` is what counts against capacity.
    where: { status: { in: ["ACTIVE", "REQUESTED", "WAITLIST"] } },
    include: { user: { select: { id: true, name: true, displayName: true, email: true } } },
  },
} satisfies Prisma.SmallGroupInclude;

export async function viewerFor(user: User | null): Promise<GroupViewer> {
  return {
    userId: user?.id ?? null,
    manages: user ? await hasCapability(user, "manage_events") : false,
  };
}

type Row = Prisma.SmallGroupGetPayload<{ include: typeof memberInclude }>;

function show(group: Row, viewer: GroupViewer): VisibleGroup {
  return presentGroup(
    group,
    group.members.map((member) => ({
      userId: member.userId,
      role: member.role,
      status: member.status,
      displayName: getDisplayName(member.user),
    })),
    viewer,
  );
}

export async function listGroups(viewer: GroupViewer): Promise<VisibleGroup[]> {
  const groups = await prisma.smallGroup.findMany({
    where: viewer.manages ? {} : { published: true },
    orderBy: { name: "asc" },
    include: memberInclude,
  });
  return groups.map((group) => show(group, viewer));
}

export async function getGroup(slug: string, viewer: GroupViewer): Promise<VisibleGroup | null> {
  const group = await prisma.smallGroup.findUnique({ where: { slug }, include: memberInclude });
  if (!group) return null;
  if (!group.published && !viewer.manages) return null;
  return show(group, viewer);
}

/** The groups this member is in, or has asked to join. */
export async function myGroups(userId: string) {
  return prisma.smallGroupMember.findMany({
    where: { userId, status: { in: ["ACTIVE", "REQUESTED"] } },
    include: { group: true },
    orderBy: { group: { name: "asc" } },
  });
}

/**
 * The requests waiting on a leader.
 *
 * Names and the note they wrote, and nothing else about them — a leader
 * deciding whether somebody may come to their house needs to know who is
 * asking, not to be handed a member directory.
 */
export async function pendingRequests(groupId: string) {
  const rows = await prisma.smallGroupMember.findMany({
    where: { groupId, status: "REQUESTED" },
    include: { user: { select: { name: true, displayName: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    name: getDisplayName(row.user),
    note: row.note,
    askedAt: row.createdAt.toISOString(),
  }));
}

export async function nextGroupSlug(name: string): Promise<string> {
  const taken = await prisma.smallGroup.findMany({ select: { slug: true } });
  return uniqueSlug(
    name,
    taken.map((group) => group.slug),
    "group",
  );
}

/**
 * Everyone waiting on this group, longest first — for its leader.
 *
 * The same shape as `pendingRequests`, and for the same reason: a leader needs
 * to know who is asking, not to be handed a member directory.
 */
export async function groupWaitingList(groupId: string) {
  const rows = await prisma.smallGroupMember.findMany({
    where: { groupId, status: "WAITLIST" },
    include: { user: { select: { name: true, displayName: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    name: getDisplayName(row.user),
    note: row.note,
    askedAt: row.createdAt.toISOString(),
  }));
}

/**
 * Moves people off the waiting list now that there is room.
 *
 * They move to **requested**, not straight in. A place opening is not the
 * leader's yes, and the leader's yes is the thing the address travels with —
 * promoting someone into the group would hand out a home address that nobody
 * agreed to give them.
 *
 * Under the group's row lock, the same way an event's capacity is decided:
 * somebody leaving while somebody else is being removed must not offer the one
 * free place to two people.
 */
export async function promoteFromWaitlist(groupId: string): Promise<number> {
  const promoted = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "SmallGroup" WHERE "id" = ${groupId} FOR UPDATE`;

    const group = await tx.smallGroup.findUnique({
      where: { id: groupId },
      include: { members: { select: { userId: true, role: true, status: true, id: true, createdAt: true } } },
    });
    if (!group) return [];

    const moving = promotableFromWaitlist(group.members, placesLeft(group, group.members));
    if (moving.length === 0) return [];

    await tx.smallGroupMember.updateMany({
      where: { id: { in: moving.map((member) => member.id) } },
      data: { status: "REQUESTED" },
    });
    return moving;
  });

  if (promoted.length === 0) return 0;

  const group = await prisma.smallGroup.findUniqueOrThrow({
    where: { id: groupId },
    select: { name: true, slug: true, members: { where: { role: "LEADER", status: "ACTIVE" }, select: { userId: true } } },
  });

  await Promise.all([
    notifySubscribers(
      {
        title: `A place has come up: ${group.name}`,
        body: "You're off the waiting list — the leader has your request now.",
        url: `/groups/${group.slug}`,
      },
      promoted.map((member) => member.userId),
    ),
    group.members.length > 0
      ? notifySubscribers(
          {
            title: `${promoted.length === 1 ? "Someone" : `${promoted.length} people`} moved off the waiting list`,
            body: `${group.name} has room again — there's a request waiting for you.`,
            url: `/groups/${group.slug}`,
          },
          group.members.map((leader) => leader.userId),
        )
      : Promise.resolve(),
  ]);

  return promoted.length;
}
