import { cache } from "react";
import { prisma } from "@/lib/db";
import { publishedNow } from "@/lib/content";
import { fileHref } from "@/lib/hymnal";

/**
 * The running order of hymns for a service.
 *
 * Deliberately not a Playlist: those are a member's own, hold videos, and
 * have no date. A plan is staff-published and everyone in the building opens
 * the same copy of it — closer to the board at the front of the room than to
 * anybody's library.
 *
 * An item is one of the two shapes a hymn takes here (see lib/hymnal.ts): a
 * file of its own, or a number inside a whole-book PDF. The second is why
 * `hymnNumber` exists — an admin writes down the number that goes up on the
 * board, and the page it lands on is worked out from the book's own contents
 * when a member opens it, which is the only place that knowledge lives.
 */

const planItems = {
  orderBy: { position: "asc" },
  include: {
    file: {
      select: {
        id: true,
        title: true,
        pageNumber: true,
        memberOnly: true,
        mimeType: true,
        bunnyPath: true,
        published: true,
        hidden: true,
        deletedAt: true,
        series: { select: { title: true, slug: true, hymnPerFile: true } },
      },
    },
  },
} as const;

/** Published plans, the soonest first, with anything undated after them. */
export const getPublishedServicePlans = cache(async function getPublishedServicePlans(limit = 30) {
  const plans = await prisma.servicePlan.findMany({
    where: { published: true },
    include: { items: planItems },
    // Two orderings in one list: dated plans by their day, undated drafts by
    // when they were made. Postgres sorts nulls last for ascending order,
    // which is exactly the wanted shape.
    orderBy: [{ serviceDate: "asc" }, { createdAt: "desc" }],
    take: limit,
  });
  return plans;
});

export const getServicePlan = cache(async function getServicePlan(id: string) {
  return prisma.servicePlan.findFirst({
    where: { id, published: true },
    include: { items: planItems },
  });
});

export type ServicePlanWithItems = NonNullable<Awaited<ReturnType<typeof getServicePlan>>>;
export type ServicePlanItemWithFile = ServicePlanWithItems["items"][number];

/**
 * Where an item of the running order opens.
 *
 * A hymn that is its own file goes to its lyrics page. A hymn inside a
 * whole-book PDF goes to that book's contents carrying the number — the
 * contents page resolves it against the book's own bookmarks and goes
 * straight there, because that resolution only exists in the browser that
 * has the PDF open. Without a number, the book's contents are the honest
 * destination.
 */
export function planItemHref(item: {
  hymnNumber: number | null;
  file: { id: string; mimeType: string | null; bunnyPath: string; series?: { hymnPerFile: boolean } | null };
}): string | null {
  const href = fileHref(item.file);
  if (!href) return null;
  return item.hymnNumber !== null && href.startsWith("/books/")
    ? `${href}?hymn=${item.hymnNumber}`
    : href;
}

/**
 * The number to print beside an item: the one an admin wrote down for a book,
 * or the hymn's own printed page number when it is a file in a hymn-per-file
 * series. Null where the book doesn't number what it holds.
 */
export function planItemNumber(item: {
  hymnNumber: number | null;
  file: { pageNumber: number | null };
}): number | null {
  return item.hymnNumber ?? item.file.pageNumber;
}

/**
 * Whether an item still points at something a visitor may open — a hymn
 * unpublished or trashed since the plan was made is shown as a plain row
 * rather than removed, because the order the service is being sung in is
 * still the order it is being sung in.
 */
export function planItemReadable(
  item: { file: { published: boolean; hidden: boolean; deletedAt: Date | null; memberOnly: boolean } },
  isLoggedIn: boolean,
): boolean {
  const file = item.file;
  if (!file.published || file.hidden || file.deletedAt) return false;
  return isLoggedIn || !file.memberOnly;
}

/** Files a plan can be built from: hymns and books, the two things with a page. */
export async function getPlannableFiles() {
  const files = await prisma.fileAsset.findMany({
    where: publishedNow(),
    select: {
      id: true,
      title: true,
      pageNumber: true,
      mimeType: true,
      bunnyPath: true,
      series: { select: { title: true, hymnPerFile: true } },
      category: { select: { name: true } },
    },
    orderBy: [{ title: "asc" }],
    take: 2000,
  });
  return files
    .filter((file) => fileHref(file) !== null)
    .map((file) => ({
      id: file.id,
      title: file.title,
      pageNumber: file.pageNumber,
      context: file.series?.title ?? file.category?.name ?? null,
      // A whole book is the shape that takes a hymn number; a hymn that is
      // its own file already is the hymn.
      wholeBook: !file.series?.hymnPerFile,
    }));
}
