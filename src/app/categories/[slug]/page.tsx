import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { truncateDescription, siteUrl } from "@/lib/seo";
import { jsonLdScriptProps, breadcrumbListJsonLd, type BreadcrumbItem } from "@/lib/json-ld";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CategoryTile } from "@/components/category-tile";
import { SeriesTile } from "@/components/series-tile";
import { HymnalBookGrid } from "@/components/hymnal-book-grid";
import { HymnalSearch } from "@/components/hymnal-search";
import { fileBook, pdfsOf, seriesBook } from "@/lib/hymnal";
import { categoryHasIndexedBooks } from "@/lib/content";
import { SubscribeButton } from "@/components/subscribe-button";
import { WatchLaterButton } from "@/components/watch-later-button";
import { MenuTile } from "@/components/menu-tile";
import { FileList } from "@/components/file-list";
import {
  getCategoryBySlug,
  isCategorySubscribed,
  isCategoryInWatchLater,
  canAccess,
} from "@/lib/content";
import { getCurrentUser } from "@/lib/current-user";
import { getPluginStates } from "@/lib/plugins";
import { bunnyStreamThumbnailUrl } from "@/lib/bunny";

/**
 * Mirrors the page body's own restraint: a member-only category the current
 * visitor can't view gets a generic title and no thumbnail here too, rather
 * than letting link-preview metadata leak more than the page itself shows.
 * Thumbnail fallback order matches CategoryTile: cover image, then a child
 * series' cover, then the first direct video's thumbnail.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const user = await getCurrentUser();
  const category = await getCategoryBySlug(slug, Boolean(user));
  if (!category) return {};

  if (!canAccess(category.memberOnly, Boolean(user))) {
    return { title: "Members Only", description: "This category is for members only." };
  }

  const description = category.description
    ? truncateDescription(category.description)
    : `Browse ${category.name} on Marine Team.`;
  const seriesThumbnail = category.series.find((s) => s.coverImageUrl)?.coverImageUrl ?? null;
  const firstVideo = category.videos[0];
  const thumbnailUrl =
    category.coverImageUrl ??
    seriesThumbnail ??
    (firstVideo ? bunnyStreamThumbnailUrl(firstVideo.bunnyVideoId, firstVideo.thumbnailFileName) || null : null) ??
    undefined;

  return {
    title: category.name,
    description,
    openGraph: {
      title: category.name,
      description,
      images: thumbnailUrl ? [thumbnailUrl] : undefined,
    },
    twitter: {
      card: thumbnailUrl ? "summary_large_image" : "summary",
      title: category.name,
      description,
      images: thumbnailUrl ? [thumbnailUrl] : undefined,
    },
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const category = await getCategoryBySlug(slug, Boolean(user));

  if (!category) notFound();

  const isLoggedIn = Boolean(user);
  const locked = !canAccess(category.memberOnly, isLoggedIn);

  const [plugins, subscribed, queued] = await Promise.all([
    getPluginStates(category.id),
    user ? isCategorySubscribed(user.id, category.id) : Promise.resolve(false),
    user ? isCategoryInWatchLater(user.id, category.id) : Promise.resolve(false),
  ]);
  const {
    subscriptions: subscriptionsOn,
    "watch-later": watchLaterOn,
    "book-reader": readerOn,
  } = plugins;

  const backHref = category.parent ? `/categories/${category.parent.slug}` : "/";
  const backLabel = category.parent ? category.parent.name : "Browse";

  // Gated by locked, matching MemberGate below: a visitor who can't view the
  // category doesn't get structured data (or the visible breadcrumb below)
  // describing it either — the plain back-link stays available regardless,
  // since a locked visitor still needs a way out.
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    ...(category.parent ? [{ label: category.parent.name, href: `/categories/${category.parent.slug}` }] : []),
    { label: category.name },
  ];
  const breadcrumbJsonLd = breadcrumbListJsonLd(breadcrumbItems, siteUrl);
  const isEmpty =
    category.series.length === 0 &&
    category.children.length === 0 &&
    category.videos.length === 0 &&
    category.files.length === 0;

  // A hymnalStyle category shows its books as one cover grid: each series
  // (a book, or a shelf of them) plus any PDF filed straight on the
  // category — see lib/hymnal.ts for why both shapes count. Files that
  // aren't PDFs fall through to the normal file list below.
  const categoryPdfs = category.hymnalStyle ? pdfsOf(category.files) : [];
  const books = category.hymnalStyle
    ? [
        ...category.series.map((series) => seriesBook(series, isLoggedIn)),
        ...categoryPdfs.map((file) => fileBook(file, isLoggedIn)),
      ]
    : [];
  const looseFiles = category.hymnalStyle
    ? category.files.filter((file) => !categoryPdfs.some((pdf) => pdf.id === file.id))
    : category.files;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      {!locked && <script {...jsonLdScriptProps(breadcrumbJsonLd)} />}
      <div>
        {locked ? (
          <Link href={backHref} className="text-sm text-sec hover:underline">
            ← {backLabel}
          </Link>
        ) : (
          <Breadcrumbs items={breadcrumbItems} />
        )}
        <div className="flex flex-wrap items-start justify-between gap-3 mt-1">
          <h1 className="text-3xl font-bold tracking-tight text-ink">{category.name}</h1>
          {!locked && user && (
            <div className="flex flex-wrap items-center gap-2">
              {watchLaterOn && (
                <WatchLaterButton type="category" id={category.id} initialQueued={queued} />
              )}
              {subscriptionsOn && (
                <SubscribeButton type="category" id={category.id} initialSubscribed={subscribed} />
              )}
            </div>
          )}
        </div>
        {category.description && <p className="mt-2 text-sec">{category.description}</p>}
        {category.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {category.tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-chip px-2 py-1 text-xs text-sec"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {locked ? (
        <MemberGate />
      ) : (
        <>
          {isEmpty && <p className="text-sec">Nothing published in this category yet.</p>}

          {category.hymnalStyle ? (
            <>
              {category.children.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {category.children.map((child) => (
                    <Link
                      key={child.id}
                      href={`/categories/${child.slug}`}
                      className="rounded-full border border-sep px-4 py-1.5 text-sm hover:bg-hover"
                    >
                      {child.name}
                      {child.memberOnly && <span className="ml-1.5 text-xs text-ter">Members</span>}
                    </Link>
                  ))}
                </div>
              )}
              {/* One box across every book in the section — the hymn in a
                  scanned hymnal is only findable because an admin indexed
                  its contents, so this shows nothing until one has. */}
              {books.length > 0 && !locked && (
                <HymnalSearch
                  categoryId={category.id}
                  indexed={await categoryHasIndexedBooks(category.id)}
                  bookCount={books.length}
                />
              )}
              {books.length > 0 && <HymnalBookGrid books={books} />}
            </>
          ) : (
            (category.children.length > 0 || category.series.length > 0) && (
              <div className="space-y-3">
                {category.children.map((child) => (
                  <CategoryTile key={child.id} category={child} />
                ))}
                {category.series.map((series) => (
                  <SeriesTile key={series.id} series={series} />
                ))}
              </div>
            )
          )}

          {category.videos.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-[11px] font-bold tracking-[0.08em] text-ter uppercase">Videos</h2>
              <div className="space-y-3">
                {category.videos.map((video) => (
                  <MenuTile
                    key={video.id}
                    href={`/videos/${video.slug}`}
                    title={video.title}
                    subtitle={video.description}
                    thumbnailUrl={bunnyStreamThumbnailUrl(video.bunnyVideoId, video.thumbnailFileName)}
                    badge={video.memberOnly ? "Members" : undefined}
                  />
                ))}
              </div>
            </section>
          )}

          {looseFiles.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-[11px] font-bold tracking-[0.08em] text-ter uppercase">
                {category.hymnalStyle && books.length > 0 ? "Other files" : "Files"}
              </h2>
              <FileList
                files={looseFiles}
                isLoggedIn={isLoggedIn}
                readerOn={readerOn}
                context={category.name}
                artworkUrl={category.coverImageUrl}
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function MemberGate() {
  return (
    <div className="rounded-lg border border-dashed border-sep p-8 text-center">
      <p className="font-medium">This category is for members only.</p>
      <a
        href="/auth/login"
        className="mt-4 inline-block rounded-md btn-primary text-white px-4 py-2 text-sm"
      >
        Log in to view
      </a>
    </div>
  );
}
