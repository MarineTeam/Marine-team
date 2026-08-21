import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getReadableFile, canViewFile } from "@/lib/content";
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
  const readerOn = format ? await isPluginEnabled("book-reader", categoryId) : false;
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
        </>
      )}
    </div>
  );
}
