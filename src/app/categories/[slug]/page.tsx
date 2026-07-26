import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryTile } from "@/components/category-tile";
import { SeriesTile } from "@/components/series-tile";
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
  const { subscriptions: subscriptionsOn, "watch-later": watchLaterOn } = plugins;

  const backHref = category.parent ? `/categories/${category.parent.slug}` : "/";
  const backLabel = category.parent ? category.parent.name : "Browse";
  const isEmpty =
    category.series.length === 0 &&
    category.children.length === 0 &&
    category.videos.length === 0 &&
    category.files.length === 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <div>
        <Link href={backHref} className="text-sm text-zinc-500 hover:underline">
          ← {backLabel}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3 mt-1">
          <h1 className="text-2xl font-semibold tracking-tight">{category.name}</h1>
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
        {category.description && <p className="mt-2 text-zinc-500">{category.description}</p>}
        {category.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {category.tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
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
          {isEmpty && <p className="text-zinc-500">Nothing published in this category yet.</p>}

          {(category.children.length > 0 || category.series.length > 0) && (
            <div className="space-y-3">
              {category.children.map((child) => (
                <CategoryTile key={child.id} category={child} />
              ))}
              {category.series.map((series) => (
                <SeriesTile key={series.id} series={series} />
              ))}
            </div>
          )}

          {category.videos.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Videos</h2>
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

          {category.files.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Files</h2>
              <FileList files={category.files} isLoggedIn={isLoggedIn} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function MemberGate() {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-8 text-center">
      <p className="font-medium">This category is for members only.</p>
      <a
        href="/auth/login"
        className="mt-4 inline-block rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
      >
        Log in to view
      </a>
    </div>
  );
}
