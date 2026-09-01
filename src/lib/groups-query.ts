import { Prisma, type User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { presentGroup, type GroupViewer, type VisibleGroup } from "@/lib/groups";
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
    where: { status: { in: ["ACTIVE", "REQUESTED"] } },
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
