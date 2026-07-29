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

async function userHasSiteWideContentGroup(userId: string): Promise<boolean> {
  const count = await prisma.groupAssignment.count({
    where: {
      userId,
      categoryId: null,
      seriesId: null,
      group: { capabilities: { hasSome: CONTENT_CAPABILITIES } },
    },
  });
  return count > 0;
}

async function userCanEditCategory(userId: string, categoryId: string): Promise<boolean> {
  const chain = await categoryChainIds(categoryId);
  const [legacyCount, groupCount] = await Promise.all([
    prisma.categoryEditor.count({ where: { userId, categoryId: { in: chain } } }),
    prisma.groupAssignment.count({
      where: {
        userId,
        categoryId: { in: chain },
        group: { capabilities: { hasSome: CONTENT_CAPABILITIES } },
      },
    }),
  ]);
  if (legacyCount > 0 || groupCount > 0) return true;
  return userHasSiteWideContentGroup(userId);
}

async function userCanEditSeries(
  userId: string,
  series: { id: string; categoryId: string | null },
): Promise<boolean> {
  const [direct, directGroup] = await Promise.all([
    prisma.seriesEditor.count({ where: { userId, seriesId: series.id } }),
    prisma.groupAssignment.count({
      where: { userId, seriesId: series.id, group: { capabilities: { hasSome: CONTENT_CAPABILITIES } } },
    }),
  ]);
  if (direct > 0 || directGroup > 0) return true;
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
  const [categoryEditorCount, seriesEditorCount, groupAssignmentCount] = await Promise.all([
    prisma.categoryEditor.count({ where: { userId: user.id } }),
    prisma.seriesEditor.count({ where: { userId: user.id } }),
    prisma.groupAssignment.count({ where: { userId: user.id } }),
  ]);
  return categoryEditorCount > 0 || seriesEditorCount > 0 || groupAssignmentCount > 0;
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

  const [categoryEditors, seriesEditors, groupAssignments] = await Promise.all([
    prisma.categoryEditor.findMany({ where: { userId: user.id }, select: { categoryId: true } }),
    prisma.seriesEditor.findMany({ where: { userId: user.id }, select: { seriesId: true } }),
    prisma.groupAssignment.findMany({
      where: { userId: user.id, group: { capabilities: { hasSome: CONTENT_CAPABILITIES } } },
      select: { categoryId: true, seriesId: true },
    }),
  ]);
  return {
    isAdmin: false,
    categoryIds: [
      ...categoryEditors.map((c) => c.categoryId),
      ...groupAssignments.flatMap((g) => (g.categoryId ? [g.categoryId] : [])),
    ],
    seriesIds: [
      ...seriesEditors.map((s) => s.seriesId),
      ...groupAssignments.flatMap((g) => (g.seriesId ? [g.seriesId] : [])),
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

  const assignments = await prisma.groupAssignment.findMany({
    where: { userId: user.id, group: { capabilities: { has: capability } } },
  });
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
