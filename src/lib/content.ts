import { prisma } from "@/lib/db";
import type { PrismaClient } from "@prisma/client";

export function canAccess(memberOnly: boolean, isLoggedIn: boolean): boolean {
  return !memberOnly || isLoggedIn;
}

export async function getPublishedCategoriesWithSeries(db: PrismaClient = prisma) {
  return db.category.findMany({
    orderBy: { position: "asc" },
    include: {
      series: {
        where: { published: true },
        orderBy: { position: "asc" },
      },
    },
  });
}

/** The series shown in the homepage hero banner: most recently published with a cover image. */
export async function getFeaturedSeries(db: PrismaClient = prisma) {
  const withCover = await db.series.findFirst({
    where: { published: true, coverImageUrl: { not: null } },
    orderBy: { updatedAt: "desc" },
  });
  if (withCover) return withCover;

  return db.series.findFirst({
    where: { published: true },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getUncategorizedSeries(db: PrismaClient = prisma) {
  return db.series.findMany({
    where: { published: true, categoryId: null },
    orderBy: { position: "asc" },
  });
}

export async function getSeriesBySlug(slug: string, db: PrismaClient = prisma) {
  return db.series.findFirst({
    where: { slug, published: true },
    include: {
      category: true,
      videos: { where: { published: true }, orderBy: { position: "asc" } },
      files: { where: { published: true }, orderBy: { position: "asc" } },
    },
  });
}

export async function getVideoBySlug(slug: string, db: PrismaClient = prisma) {
  return db.video.findFirst({
    where: { slug, published: true },
    include: { series: true },
  });
}
