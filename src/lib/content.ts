import { prisma } from "@/lib/db";

export function canAccess(memberOnly: boolean, isLoggedIn: boolean): boolean {
  return !memberOnly || isLoggedIn;
}

/** Root-level categories (no parent) for the homepage — each may have its own series and/or child categories. */
export async function getPublishedCategoriesWithSeries() {
  return prisma.category.findMany({
    where: { parentId: null },
    orderBy: { position: "asc" },
    include: {
      series: {
        where: { published: true },
        orderBy: { position: "asc" },
      },
      children: { orderBy: { position: "asc" } },
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
      children: {
        orderBy: { position: "asc" },
        include: {
          series: { where: { published: true }, orderBy: { position: "asc" } },
          children: true,
        },
      },
      parent: true,
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

/** Public search across categories, series, and videos by name/title/description. */
export async function searchContent(query: string) {
  const q = query.trim();
  if (!q) return { categories: [], series: [], videos: [] };

  const [categories, series, videos] = await Promise.all([
    prisma.category.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      orderBy: { position: "asc" },
      include: {
        series: { where: { published: true }, orderBy: { position: "asc" } },
        children: true,
      },
      take: 20,
    }),
    prisma.series.findMany({
      where: {
        published: true,
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { position: "asc" },
      take: 20,
    }),
    prisma.video.findMany({
      where: {
        published: true,
        status: "READY",
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      },
      include: { series: true },
      orderBy: { position: "asc" },
      take: 20,
    }),
  ]);

  return { categories, series, videos };
}
