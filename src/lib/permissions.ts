import { cache } from "react";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { categoryChainIds } from "@/lib/content";
import type { User } from "@prisma/client";
import type { CapabilityKey } from "@/lib/capabilities";

/** Capabilities that, granted via a permission group, are equivalent to a legacy category/series editor grant. */
const CONTENT_CAPABILITIES: CapabilityKey[] = [
  "manage_series",
  "manage_videos",
  "manage_files",
  "publish_content",
];

type Assignment = { categoryId: string | null; seriesId: string | null; capabilities: string[] };

/**
 * Every permission-group assignment this member holds, read once per request.
 *
 * Each check used to run its own `groupAssignment` query filtered by the
 * capability it cared about, so rendering the admin shell for a non-admin cost
 * one query per capability in the nav — five before the page itself asked
 * anything. A member has a handful of assignments at most; fetching them once
 * and filtering in memory is one query for all of it, and React's `cache`
 * keeps it to one for the whole request.
 *
 * Keyed by the id rather than the user object, so a caller that rebuilt the
 * object still hits the same entry.
 */
const assignmentsOf = cache(async (userId: string): Promise<Assignment[]> => {
  // One statement rather than a Prisma `include`, which without the
  // `relationJoins` preview feature fetches the groups in a second round
  // trip — and this wants to be one query whether the cache above is in play
  // or not. Parameterised, like every other raw query in this codebase.
  return prisma.$queryRaw<Assignment[]>`
    SELECT a."categoryId", a."seriesId", g."capabilities"
    FROM "GroupAssignment" a
    JOIN "PermissionGroup" g ON g."id" = a."groupId"
    WHERE a."userId" = ${userId}
  `;
});

/** The same test the `hasSome: CONTENT_CAPABILITIES` filter made in SQL. */
function isContentGroup(assignment: Assignment): boolean {
  return assignment.capabilities.some((key) => CONTENT_CAPABILITIES.includes(key as CapabilityKey));
}

/** The legacy editor rows, also read once per request. */
const editorGrantsOf = cache(async (userId: string) => {
  const [categories, series] = await Promise.all([
    prisma.categoryEditor.findMany({ where: { userId }, select: { categoryId: true } }),
    prisma.seriesEditor.findMany({ where: { userId }, select: { seriesId: true } }),
  ]);
  return { categoryIds: categories.map((row) => row.categoryId), seriesIds: series.map((row) => row.seriesId) };
});

async function userHasSiteWideContentGroup(userId: string): Promise<boolean> {
  const assignments = await assignmentsOf(userId);
  return assignments.some((a) => !a.categoryId && !a.seriesId && isContentGroup(a));
}

async function userCanEditCategory(userId: string, categoryId: string): Promise<boolean> {
  const [chain, assignments, editors] = await Promise.all([
    categoryChainIds(categoryId),
    assignmentsOf(userId),
    editorGrantsOf(userId),
  ]);
  const inChain = new Set(chain);
  if (editors.categoryIds.some((id) => inChain.has(id))) return true;
  if (assignments.some((a) => a.categoryId && inChain.has(a.categoryId) && isContentGroup(a))) return true;
  return userHasSiteWideContentGroup(userId);
}

async function userCanEditSeries(
  userId: string,
  series: { id: string; categoryId: string | null },
): Promise<boolean> {
  const [assignments, editors] = await Promise.all([assignmentsOf(userId), editorGrantsOf(userId)]);
  if (editors.seriesIds.includes(series.id)) return true;
  if (assignments.some((a) => a.seriesId === series.id && isContentGroup(a))) return true;
  if (await userHasSiteWideContentGroup(userId)) return true;
  if (!series.categoryId) return false;
  return userCanEditCategory(userId, series.categoryId);
}

/** Boolean check for use in server components (which can't throw a NextResponse like the API guards do). */
export async function canEditCategory(user: User, categoryId: string): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  return userCanEditCategory(user.id, categoryId);
}

/** Boolean check for use in server components (which can't throw a NextResponse like the API guards do). */
export async function canEditSeries(
  user: User,
  series: { id: string; categoryId: string | null },
): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  return userCanEditSeries(user.id, series);
}

/** Whether the user is an admin or has at least one editor/group assignment, for gating /admin entry. */
export async function isStaff(user: User): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  // The same two cached reads every capability check uses, rather than three
  // counts of its own: a request that asks this and then asks anything else
  // pays for one round of queries in total.
  const [assignments, editors] = await Promise.all([assignmentsOf(user.id), editorGrantsOf(user.id)]);
  return assignments.length > 0 || editors.categoryIds.length > 0 || editors.seriesIds.length > 0;
}

/** Resolves the current user, requiring admin or at least one editor/group assignment; throws a NextResponse otherwise. */
export async function ensureStaff(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await isStaff(user))) {
    throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return user;
}

export async function ensureCategoryAccess(user: User, categoryId: string): Promise<void> {
  if (user.role === "ADMIN") return;
  if (!(await userCanEditCategory(user.id, categoryId))) {
    throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}

export async function ensureSeriesAccess(
  user: User,
  series: { id: string; categoryId: string | null },
): Promise<void> {
  if (user.role === "ADMIN") return;
  if (!(await userCanEditSeries(user.id, series))) {
    throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}

/**
 * The set of category/series ids a non-admin editor is scoped to; admins
 * (and users with a site-wide content permission group) get unrestricted access.
 */
export async function getEditableScope(
  user: User,
): Promise<{ isAdmin: true } | { isAdmin: false; categoryIds: string[]; seriesIds: string[] }> {
  if (user.role === "ADMIN") return { isAdmin: true };
  if (await userHasSiteWideContentGroup(user.id)) return { isAdmin: true };

  const [assignments, editors] = await Promise.all([assignmentsOf(user.id), editorGrantsOf(user.id)]);
  const contentGroups = assignments.filter(isContentGroup);
  return {
    isAdmin: false,
    categoryIds: [
      ...editors.categoryIds,
      ...contentGroups.flatMap((a) => (a.categoryId ? [a.categoryId] : [])),
    ],
    seriesIds: [
      ...editors.seriesIds,
      ...contentGroups.flatMap((a) => (a.seriesId ? [a.seriesId] : [])),
    ],
  };
}

/**
 * Videos and files aren't directly assignable to a user — access follows
 * whatever series they belong to, or, for a video/file attached straight to
 * a category (skipping the series layer), the category itself.
 */
export async function ensureContentAccess(
  user: User,
  target: { seriesId: string | null; categoryId: string | null },
): Promise<void> {
  if (user.role === "ADMIN") return;
  if (target.seriesId) {
    const series = await prisma.series.findUnique({
      where: { id: target.seriesId },
      select: { id: true, categoryId: true },
    });
    if (!series) throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await ensureSeriesAccess(user, series);
    return;
  }
  if (target.categoryId) {
    await ensureCategoryAccess(user, target.categoryId);
    return;
  }
  throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * Whether the user holds `capability`, either via a site-wide permission
 * group assignment, or one scoped to the given category/series. Admins
 * always pass. With no `scope` given, only site-wide assignments count
 * (appropriate for site-wide actions like managing users or plugins).
 */
export async function hasCapability(
  user: User,
  capability: CapabilityKey,
  scope?: { categoryId?: string | null; seriesId?: string | null },
): Promise<boolean> {
  if (user.role === "ADMIN") return true;

  const assignments = (await assignmentsOf(user.id)).filter((a) => a.capabilities.includes(capability));
  if (assignments.length === 0) return false;
  if (assignments.some((a) => !a.categoryId && !a.seriesId)) return true;
  if (!scope) return false;

  let categoryChain: string[] = [];
  if (scope.categoryId) {
    categoryChain = await categoryChainIds(scope.categoryId);
  } else if (scope.seriesId) {
    const series = await prisma.series.findUnique({
      where: { id: scope.seriesId },
      select: { categoryId: true },
    });
    if (series?.categoryId) categoryChain = await categoryChainIds(series.categoryId);
  }

  return assignments.some((a) => {
    if (scope.seriesId && a.seriesId === scope.seriesId) return true;
    if (a.categoryId && categoryChain.includes(a.categoryId)) return true;
    return false;
  });
}

export async function ensureCapability(
  user: User,
  capability: CapabilityKey,
  scope?: { categoryId?: string | null; seriesId?: string | null },
): Promise<void> {
  if (!(await hasCapability(user, capability, scope))) {
    throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}

/**
 * Same shape as getEditableScope, but for an arbitrary capability rather
 * than the fixed content-management set — used by the /admin/comments
 * queue so a moderator scoped to one category/series only sees reports
 * under it, while a site-wide moderate_comments grant (or ADMIN) sees
 * everything, mirroring how getEditableScope resolves content access.
 */
export async function getCapabilityScope(
  user: User,
  capability: CapabilityKey,
): Promise<{ isAdmin: true } | { isAdmin: false; categoryIds: string[]; seriesIds: string[] }> {
  if (user.role === "ADMIN") return { isAdmin: true };

  const assignments = (await assignmentsOf(user.id)).filter((a) => a.capabilities.includes(capability));
  if (assignments.some((a) => !a.categoryId && !a.seriesId)) return { isAdmin: true };

  return {
    isAdmin: false,
    categoryIds: assignments.flatMap((a) => (a.categoryId ? [a.categoryId] : [])),
    seriesIds: assignments.flatMap((a) => (a.seriesId ? [a.seriesId] : [])),
  };
}

/** Every category id reachable under the given root category ids (roots included). */
export async function descendantCategoryIds(rootIds: string[]): Promise<string[]> {
  if (rootIds.length === 0) return [];
  const all = await prisma.category.findMany({ select: { id: true, parentId: true } });
  const ids = new Set(rootIds);
  let added = true;
  while (added) {
    added = false;
    for (const c of all) {
      if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
        ids.add(c.id);
        added = true;
      }
    }
  }
  return Array.from(ids);
}
