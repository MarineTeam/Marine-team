import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canViewFile, getBookHymn, getReadableFile } from "@/lib/content";
import { getCurrentUser } from "@/lib/current-user";
import { getServicePlan, planItemNumber, presentHref } from "@/lib/services";
import { splitVerses } from "@/lib/verses";
import { hymnNumberOf } from "@/lib/toc-nav";
import { Presenter, type PresentNeighbour } from "@/components/presenter";
import { HymnLookup } from "@/components/hymn-lookup";

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
 * `?hymn=` presents a numbered hymn inside a whole-book hymnal rather than
 * the file itself — a scanned book has no page of its own per hymn, so the
 * number is the only thing that names one (see BookHymnDetail).
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
  searchParams: Promise<{ plan?: string; hymn?: string }>;
}) {
  const { fileId } = await params;
  const { plan: planId, hymn: hymnParam } = await searchParams;

  const [file, user] = await Promise.all([getReadableFile(fileId), getCurrentUser()]);
  if (!file) notFound();
  if (!(await canViewFile(user, file))) notFound();

  const wantedNumber = /^\d{1,4}$/.test(hymnParam ?? "") ? Number(hymnParam) : null;
  const hymn = wantedNumber === null ? null : await getBookHymn(fileId, wantedNumber);
  // A number that names nothing in this book is a wrong link, not an empty
  // screen to stand in front of.
  if (wantedNumber !== null && !hymn) notFound();

  const plan = planId ? await getServicePlan(planId) : null;
  const at = plan
    ? plan.items.findIndex(
        (item) => item.file.id === file.id && item.hymnNumber === (hymn?.number ?? null),
      )
    : -1;

  const neighbour = (offset: 1 | -1): PresentNeighbour => {
    if (!plan || at === -1) return null;
    const item = plan.items[at + offset];
    if (!item) return null;
    return {
      href: presentHref(item, plan.id),
      title: item.file.title,
      number: planItemNumber(item),
    };
  };

  // A contents label usually leads with the number ("214 Amazing Grace"), so
  // repeating it underneath would put it on the wall twice.
  const numbering = hymn
    ? hymnNumberOf(hymn.title) === hymn.number
      ? null
      : `No. ${hymn.number}`
    : file.pageNumber
      ? `No. ${file.pageNumber}`
      : null;

  const subtitle =
    [
      numbering,
      plan?.title ?? (hymn ? file.title : file.series?.title),
    ]
      .filter(Boolean)
      .join(" · ") || null;

  return (
    <>
      {/* Putting a hymn on the wall is the strongest signal there is that it
          was sung; counted like any other opening. */}
      <HymnLookup fileId={file.id} number={hymn?.number ?? null} source="present" />
      <Presenter
        title={hymn ? hymn.title : file.title}
        subtitle={subtitle}
        // Stays on screen the whole time the words are up — see the prop.
        copyright={hymn ? hymn.copyright : file.songCopyright}
        verses={splitVerses(hymn ? hymn.lyricsText : file.lyricsText)}
        // Out of present mode goes back where it was entered from: the service
        // being led, the book the hymn is in, or the hymn's own page.
        backHref={plan ? `/services/${plan.id}` : hymn ? `/books/${file.id}` : `/hymns/${file.id}`}
        previous={neighbour(-1)}
        next={neighbour(1)}
      />
    </>
  );
}
