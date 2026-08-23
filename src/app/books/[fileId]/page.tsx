import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getNavCategories, getReadableFile, canViewFile } from "@/lib/content";
import { getCurrentUser } from "@/lib/current-user";
import { readerFormat } from "@/lib/reader";
import { BookContents } from "@/components/book-contents";
import { SaveBookButton } from "@/components/save-book-button";
import { bookCacheTag } from "@/lib/reader-cache";
import { getPluginStates } from "@/lib/plugins";

/**
 * A hymnal book's own page: its table of contents, read straight from the
 * PDF's embedded bookmarks, with each entry opening the reader at that
 * page. Uses the same file and access model as /read/[fileId] rather than
 * introducing a separate content type — a "book" here is just a PDF.
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
    return { title: "Members Only", description: "This book is for members only." };
  }
  return { title: file.title, description: `Browse ${file.title} on Marine Team.` };
}

export default async function BookPage({ params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const [file, user] = await Promise.all([getReadableFile(fileId), getCurrentUser()]);
  if (!file) notFound();
  if (!readerFormat(file.mimeType, file.bunnyPath)) notFound();

  const locked = !(await canViewFile(user, file));
  // Scoped to the file's own category (or its series' one), matching
  // /read/[fileId]: a category can turn the reader off for its section.
  const categoryId = file.category?.id ?? file.series?.categoryId ?? null;
  const [plugins, navCategories] = await Promise.all([
    getPluginStates(categoryId),
    // Only the top-level categories, which is exactly the set the bottom bar
    // can hold an icon for — a book under one is reachable from that icon
    // offline, and one filed deeper simply isn't offered there.
    getNavCategories(),
  ]);
  const readerOn = plugins["book-reader"];
  const navCategory = navCategories.find((category) => category.id === categoryId) ?? null;
  // Saving a book to the device is the same permission as saving a video to
  // it, and a category can turn it off for its own section.
  const offlineOn = plugins.downloads && readerFormat(file.mimeType, file.bunnyPath) === "pdf";

  const backHref = file.series
    ? `/series/${file.series.slug}`
    : file.category
      ? `/categories/${file.category.slug}`
      : "/";
  const backLabel = file.series?.title ?? file.category?.name ?? "Browse";

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <Link href={backHref} className="text-sm text-sec hover:underline">
        ← {backLabel}
      </Link>

      <h1 className="text-3xl font-bold tracking-tight text-ink">{file.title}</h1>

      {locked ? (
        <div className="rounded-lg border border-dashed border-sep p-8 text-center">
          <p className="font-medium">
            {user ? "You don't have access to this book." : "This book is for members only."}
          </p>
          {!user && (
            <a
              href="/auth/login"
              className="mt-4 inline-block rounded-md btn-primary px-4 py-2 text-sm text-white"
            >
              Log in to view
            </a>
          )}
        </div>
      ) : (
        <>
          {offlineOn && (
            <SaveBookButton
              fileId={file.id}
              title={file.title}
              // Where a tap on this section's icon should find the book when
              // there's no connection: its series if it has one, else its
              // category — the same place the "back" link goes.
              homeHref={backHref === "/" ? null : backHref}
              homeLabel={backLabel}
              categoryHref={navCategory ? `/categories/${navCategory.slug}` : null}
              categoryLabel={navCategory?.name ?? null}
              pageOffset={file.pageOffset}
              sizeBytes={file.sizeBytes}
            />
          )}
          <BookContents
            fileId={file.id}
            readerOn={readerOn}
            pageOffset={file.pageOffset}
            cacheTag={bookCacheTag(file)}
          />
        </>
      )}
    </div>
  );
}
