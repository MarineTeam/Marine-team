import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canViewFile, getReadableFile } from "@/lib/content";
import { getCurrentUser } from "@/lib/current-user";
import { getServicePlan, planItemNumber } from "@/lib/services";
import { splitVerses } from "@/lib/verses";
import { Presenter, type PresentNeighbour } from "@/components/presenter";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ fileId: string }>;
}): Promise<Metadata> {
  const { fileId } = await params;
  const file = await getReadableFile(fileId);
  // Never indexed and never previewed: this is a screen in a room, not a page
  // anybody should arrive at from a search engine.
  return { title: file?.title ?? "Present", robots: { index: false, follow: false } };
}

/**
 * A hymn's words, on the screen at the front of the room.
 *
 * `?plan=` presents it as part of a service: the hymns either side come from
 * that plan's order, so whoever is driving moves through the whole thing
 * without going back to a list between hymns.
 *
 * Access is the same check as reading it — this shows nothing a visitor
 * couldn't already open, in larger type.
 */
export default async function PresentPage({
  params,
  searchParams,
}: {
  params: Promise<{ fileId: string }>;
  searchParams: Promise<{ plan?: string }>;
}) {
  const { fileId } = await params;
  const { plan: planId } = await searchParams;

  const [file, user] = await Promise.all([getReadableFile(fileId), getCurrentUser()]);
  if (!file) notFound();
  if (!(await canViewFile(user, file))) notFound();

  const plan = planId ? await getServicePlan(planId) : null;
  const at = plan ? plan.items.findIndex((item) => item.file.id === file.id) : -1;

  const neighbour = (offset: 1 | -1): PresentNeighbour => {
    if (!plan || at === -1) return null;
    const item = plan.items[at + offset];
    if (!item) return null;
    return {
      href: `/present/${item.file.id}?plan=${plan.id}`,
      title: item.file.title,
      number: planItemNumber(item),
    };
  };

  return (
    <Presenter
      title={file.title}
      subtitle={
        [file.pageNumber ? `No. ${file.pageNumber}` : null, plan?.title ?? file.series?.title]
          .filter(Boolean)
          .join(" · ") || null
      }
      verses={splitVerses(file.lyricsText)}
      // Out of present mode goes back where it was entered from: the service
      // being led, or the hymn itself.
      backHref={plan ? `/services/${plan.id}` : `/hymns/${file.id}`}
      previous={neighbour(-1)}
      next={neighbour(1)}
    />
  );
}
