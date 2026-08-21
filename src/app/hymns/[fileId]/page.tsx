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
      <Link href={backHref} className="text-sm text-zinc-500 hover:underline">
        ← {backLabel}
      </Link>

      {locked ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <p className="font-medium">
            {isLoggedIn ? "You don't have access to this hymn." : "This hymn is for members only."}
          </p>
          {!isLoggedIn && (
            <a
              href="/auth/login"
              className="mt-4 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
            >
              Log in
            </a>
          )}
        </div>
      ) : (
        <>
          <div>
            <div className="flex flex-wrap items-baseline gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{file.title}</h1>
              {file.pageNumber != null && (
                <span className="text-sm text-zinc-500">Page {file.pageNumber}</span>
              )}
            </div>
            {file.series && (
              <p className="mt-1 text-sm text-zinc-500">
                {file.series.abbreviation ? `${file.series.abbreviation} · ` : ""}
                {file.series.title}
              </p>
            )}
          </div>

          {file.lyricsText ? (
            <>
              <div className="whitespace-pre-wrap rounded-lg border border-zinc-200 p-5 text-[15px] leading-relaxed dark:border-zinc-800">
                {file.lyricsText}
              </div>
              <a
                href={pdfHref}
                className="inline-block rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {pdfLabel} (if the text above doesn&apos;t look right)
              </a>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
              <p className="text-zinc-500">Lyrics text isn&apos;t available for this hymn yet.</p>
              <a
                href={pdfHref}
                className="mt-4 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
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
