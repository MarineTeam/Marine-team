import { prisma } from "@/lib/db";

export function canAccess(memberOnly: boolean, isLoggedIn: boolean): boolean {
  return !memberOnly || isLoggedIn;
}

export async function getPublishedCategoriesWithSeries() {
  return prisma.category.findMany({
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
export async function getFeaturedSeries() {
  const withCover = await prisma.series.findFirst({
    where: { published: true, coverImageUrl: { not: null } },
    orderBy: { updatedAt: "desc" },
  });
  if (withCover) return withCover;

  return prisma.series.findFirst({
    where: { published: true },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getCategoryBySlug(slug: string) {
  return prisma.category.findFirst({
    where: { slug },
    include: {
      series: { where: { published: true }, orderBy: { position: "asc" } },
    },
  });
}

export async function getUncategorizedSeries() {
  return prisma.series.findMany({
    where: { published: true, categoryId: null },
    orderBy: { position: "asc" },
  });
}

export async function getSeriesBySlug(slug: string) {
  return prisma.series.findFirst({
    where: { slug, published: true },
    include: {
      category: true,
      videos: { where: { published: true }, orderBy: { position: "asc" } },
      files: { where: { published: true }, orderBy: { position: "asc" } },
    },
  });
}

export async function getVideoBySlug(slug: string) {
  return prisma.video.findFirst({
    where: { slug, published: true },
    include: { series: true },
  });
}
