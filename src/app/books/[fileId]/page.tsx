import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getReadableFile, canViewFile } from "@/lib/content";
import { getCurrentUser } from "@/lib/current-user";
import { isPluginEnabled } from "@/lib/plugins";
import { readerFormat } from "@/lib/reader";
import { BookContents } from "@/components/book-contents";

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
  const readerOn = await isPluginEnabled("book-reader", categoryId);

  const backHref = file.series
    ? `/series/${file.series.slug}`
    : file.category
      ? `/categories/${file.category.slug}`
      : "/";
  const backLabel = file.series?.title ?? file.category?.name ?? "Browse";

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <Link href={backHref} className="text-sm text-zinc-500 hover:underline">
        ← {backLabel}
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">{file.title}</h1>

      {locked ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <p className="font-medium">
            {user ? "You don't have access to this book." : "This book is for members only."}
          </p>
          {!user && (
            <a
              href="/auth/login"
              className="mt-4 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
            >
              Log in to view
            </a>
          )}
        </div>
      ) : (
        <BookContents fileId={file.id} readerOn={readerOn} />
      )}
    </div>
  );
}
