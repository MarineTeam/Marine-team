import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { canViewFile, getReadableFile } from "@/lib/content";
import { getCurrentUser } from "@/lib/current-user";
import { isPluginEnabled } from "@/lib/plugins";
import { readerFormat } from "@/lib/reader";
import { BookReader } from "@/components/book-reader";

/**
 * A book the current visitor can't read gets a generic title here, the same
 * restraint the video and series pages already apply — link previews
 * shouldn't reveal more than the page itself will show.
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
    return { title: "Members Only", description: "This file is for members only." };
  }
  return { title: file.title, description: `Read ${file.title} on Marine Team.` };
}

export default async function ReadPage({
  params,
  searchParams,
}: {
  params: Promise<{ fileId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { fileId } = await params;
  const { page } = await searchParams;
  const [file, user] = await Promise.all([getReadableFile(fileId), getCurrentUser()]);
  if (!file) notFound();

  // Scoped to the file's own category (or its series' one) so a category can
  // turn the reader off for its section without affecting the rest of the site.
  const categoryId = file.category?.id ?? file.series?.categoryId ?? null;
  const readerOn = await isPluginEnabled("book-reader", categoryId);
  if (!readerOn) notFound();

  const format = readerFormat(file.mimeType, file.bunnyPath);
  if (!format) notFound();

  if (!(await canViewFile(user, file))) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="font-medium">
          {user ? "You don't have access to this file." : "This file is for members only."}
        </p>
        {!user && (
          <a
            href="/auth/login"
            className="mt-4 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
          >
            Log in to read
          </a>
        )}
      </div>
    );
  }

  const progress = user
    ? await prisma.readingProgress.findUnique({
        where: { userId_fileId: { userId: user.id, fileId: file.id } },
        select: { location: true },
      })
    : null;
  // A page linked from a book's contents list (?page=12) always wins over
  // the viewer's own resume position — tapping a specific hymn should open
  // to that hymn, not silently continue from wherever they last stopped.
  const requestedPage = page && Number.isFinite(Number(page)) && Number(page) >= 1 ? page : null;

  const backHref = file.series
    ? `/series/${file.series.slug}`
    : file.category
      ? `/categories/${file.category.slug}`
      : "/";
  const backLabel = file.series?.title ?? file.category?.name ?? "Browse";

  return (
    <BookReader
      fileId={file.id}
      fileTitle={file.title}
      format={format}
      backHref={backHref}
      backLabel={backLabel}
      initialLocation={requestedPage ?? progress?.location ?? null}
      canSaveProgress={Boolean(user)}
    />
  );
}
