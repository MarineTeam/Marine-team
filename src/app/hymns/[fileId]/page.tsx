import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdjacentHymns, getReadableFile, canViewFile, isFileFavorited } from "@/lib/content";
import { FavoriteButton } from "@/components/favorite-button";
import { HymnLookup } from "@/components/hymn-lookup";
import { KeepAwake } from "@/components/keep-awake";
import { getCurrentUser } from "@/lib/current-user";
import { isPluginEnabled } from "@/lib/plugins";
import { readerFormat } from "@/lib/reader";

/**
 * A hymn's "lyrics-first" detail page: the admin-entered lyricsText renders
 * as the primary view, with the underlying PDF (via the existing book
 * reader, or a plain download) always offered alongside as a failsafe in
 * case the formatted text doesn't do the hymn justice or wasn't entered.
 * Reuses the same file/access model as /read/[fileId] rather than
 * introducing a separate content type.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ fileId: string }>;
}): Promise<Metadata> {
  const { fileId } = await params;
  const [file, user] = await Promise.all([getReadableFile(fileId), getCurrentUser()]);
  if (!file) return {};
  if (!(await canViewFile(user, file))) {
    return { title: "Members Only", description: "This hymn is for members only." };
  }
  return { title: file.title, description: `${file.title} lyrics on Marine Team.` };
}

export default async function HymnPage({ params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const [file, user] = await Promise.all([getReadableFile(fileId), getCurrentUser()]);
  if (!file) notFound();

  const isLoggedIn = Boolean(user);
  const locked = !(await canViewFile(user, file));

  const backHref = file.series ? `/series/${file.series.slug}` : file.category ? `/categories/${file.category.slug}` : "/";
  const backLabel = file.series?.title ?? file.category?.name ?? "Browse";

  const categoryId = file.category?.id ?? file.series?.categoryId ?? null;
  const format = readerFormat(file.mimeType, file.bunnyPath);
  const [readerOn, { previous, next }, favoritesOn, favorited] = await Promise.all([
    format ? isPluginEnabled("book-reader", categoryId) : Promise.resolve(false),
    // The hymns either side, in a book whose files are its hymns. Skipped for
    // a hymn this viewer can't open, where the page shows nothing to step
    // away from anyway.
    locked
      ? Promise.resolve({ previous: null, next: null })
      : getAdjacentHymns(file.id, file.seriesId, isLoggedIn),
    isPluginEnabled("favorites", categoryId),
    user && !locked ? isFileFavorited(user.id, file.id) : Promise.resolve(false),
  ]);
  const pdfHref = readerOn ? `/read/${file.id}` : `/api/files/${file.id}/content?download=1`;
  const pdfLabel = readerOn ? "View as PDF" : "Download PDF";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      <Link href={backHref} className="text-sm text-sec hover:underline">
        ← {backLabel}
      </Link>

      {locked ? (
        <div className="rounded-lg border border-dashed border-sep p-8 text-center">
          <p className="font-medium">
            {isLoggedIn ? "You don't have access to this hymn." : "This hymn is for members only."}
          </p>
          {!isLoggedIn && (
            <a
              href="/auth/login"
              className="mt-4 inline-block rounded-md btn-primary px-4 py-2 text-sm text-white"
            >
              Log in
            </a>
          )}
        </div>
      ) : (
        <>
          {/* Counted in the browser rather than on the server: a hymn list
              prefetches its links, and a render is not an opening. */}
          <HymnLookup fileId={file.id} source="hymn" />
          <div>
            <div className="flex flex-wrap items-baseline gap-2">
              <h1 className="text-3xl font-bold tracking-tight text-ink">{file.title}</h1>
              {file.pageNumber != null && (
                <span className="text-sm text-sec">Page {file.pageNumber}</span>
              )}
            </div>
            {file.series && (
              <p className="mt-1 text-sm text-sec">
                {file.series.abbreviation ? `${file.series.abbreviation} · ` : ""}
                {file.series.title}
              </p>
            )}
          </div>

          {/* The lyrics stay on screen for as long as the hymn lasts, and
              nobody is tapping to keep them there. */}
          <KeepAwake />

          {/* Keeping a hymn is the list a worship leader actually wants, and
              it is the same button the rest of the app uses. */}
          <div className="flex flex-wrap items-center gap-2">
            {favoritesOn && user && (
              <FavoriteButton type="file" id={file.id} initialFavorited={favorited} />
            )}
            {/* Only where there are words to put on a wall. */}
            {file.lyricsText && (
              <Link
                href={`/present/${file.id}`}
                className="rounded-md border border-sep px-3 py-1.5 text-sm hover:bg-hover"
              >
                Present
              </Link>
            )}
          </div>

          {file.lyricsText ? (
            <>
              <div className="whitespace-pre-wrap rounded-lg border border-sep p-5 text-[15px] leading-relaxed">
                {file.lyricsText}
              </div>
              <a
                href={pdfHref}
                className="inline-block rounded-md border border-sep px-4 py-2 text-sm hover:bg-hover"
              >
                {pdfLabel} (if the text above doesn&apos;t look right)
              </a>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-sep p-8 text-center">
              <p className="text-sec">Lyrics text isn&apos;t available for this hymn yet.</p>
              <a
                href={pdfHref}
                className="mt-4 inline-block rounded-md btn-primary px-4 py-2 text-sm text-white"
              >
                {pdfLabel}
              </a>
            </div>
          )}

          {(previous || next) && (
            <nav
              aria-label="Hymns in this book"
              className="flex items-center gap-3 border-t border-sep pt-4 text-sm"
            >
              {previous ? (
                <Link
                  href={`/hymns/${previous.id}`}
                  rel="prev"
                  className="min-w-0 flex-1 truncate text-sec hover:underline"
                >
                  ‹ {previous.pageNumber != null ? `${previous.pageNumber}. ` : ""}
                  {previous.title}
                </Link>
              ) : (
                <span className="flex-1" />
              )}
              {next ? (
                <Link
                  href={`/hymns/${next.id}`}
                  rel="next"
                  className="min-w-0 flex-1 truncate text-right text-sec hover:underline"
                >
                  {next.pageNumber != null ? `${next.pageNumber}. ` : ""}
                  {next.title} ›
                </Link>
              ) : (
                <span className="flex-1" />
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
