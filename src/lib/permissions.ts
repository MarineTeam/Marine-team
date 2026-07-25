import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import type { User } from "@prisma/client";

async function categoryChainIds(categoryId: string): Promise<string[]> {
  const ids: string[] = [];
  let currentId: string | null = categoryId;
  while (currentId) {
    ids.push(currentId);
    const category: { parentId: string | null } | null = await prisma.category.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });
    currentId = category?.parentId ?? null;
  }
  return ids;
}

async function userCanEditCategory(userId: string, categoryId: string): Promise<boolean> {
  const chain = await categoryChainIds(categoryId);
  const count = await prisma.categoryEditor.count({ where: { userId, categoryId: { in: chain } } });
  return count > 0;
}

async function userCanEditSeries(
  userId: string,
  series: { id: string; categoryId: string | null },
): Promise<boolean> {
  const direct = await prisma.seriesEditor.count({ where: { userId, seriesId: series.id } });
  if (direct > 0) return true;
  if (!series.categoryId) return false;
  return userCanEditCategory(userId, series.categoryId);
}

/** Boolean check for use in server components (which can't throw a NextResponse like the API guards do). */
export async function canEditSeries(
  user: User,
  series: { id: string; categoryId: string | null },
): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  return userCanEditSeries(user.id, series);
}

/** Whether the user is an admin or has at least one editor assignment, for gating /admin entry. */
export async function isStaff(user: User): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  const [categoryEditorCount, seriesEditorCount] = await Promise.all([
    prisma.categoryEditor.count({ where: { userId: user.id } }),
    prisma.seriesEditor.count({ where: { userId: user.id } }),
  ]);
  return categoryEditorCount > 0 || seriesEditorCount > 0;
}

/** Resolves the current user, requiring admin or at least one editor assignment; throws a NextResponse otherwise. */
export async function ensureStaff(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (user.role === "ADMIN") return user;
  const [categoryEditorCount, seriesEditorCount] = await Promise.all([
    prisma.categoryEditor.count({ where: { userId: user.id } }),
    prisma.seriesEditor.count({ where: { userId: user.id } }),
  ]);
  if (categoryEditorCount === 0 && seriesEditorCount === 0) {
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

/** The set of category/series ids a non-admin editor is scoped to; admins get unrestricted access. */
export async function getEditableScope(
  user: User,
): Promise<{ isAdmin: true } | { isAdmin: false; categoryIds: string[]; seriesIds: string[] }> {
  if (user.role === "ADMIN") return { isAdmin: true };
  const [categoryEditors, seriesEditors] = await Promise.all([
    prisma.categoryEditor.findMany({ where: { userId: user.id }, select: { categoryId: true } }),
    prisma.seriesEditor.findMany({ where: { userId: user.id }, select: { seriesId: true } }),
  ]);
  return {
    isAdmin: false,
    categoryIds: categoryEditors.map((c) => c.categoryId),
    seriesIds: seriesEditors.map((s) => s.seriesId),
  };
}

/** Videos and files aren't directly assignable — access follows whatever series they belong to. */
export async function ensureSeriesRelatedAccess(user: User, seriesId: string | null): Promise<void> {
  if (user.role === "ADMIN") return;
  if (!seriesId) throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const series = await prisma.series.findUnique({
    where: { id: seriesId },
    select: { id: true, categoryId: true },
  });
  if (!series) throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensureSeriesAccess(user, series);
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
