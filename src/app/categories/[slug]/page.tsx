import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryTile } from "@/components/category-tile";
import { SeriesTile } from "@/components/series-tile";
import { SubscribeButton } from "@/components/subscribe-button";
import { MenuTile } from "@/components/menu-tile";
import { FileList } from "@/components/file-list";
import { getCategoryBySlug, isCategorySubscribed } from "@/lib/content";
import { getCurrentUser } from "@/lib/current-user";
import { isPluginEnabled } from "@/lib/plugins";
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

  const [subscriptionsOn, subscribed] = await Promise.all([
    isPluginEnabled("subscriptions", category.id),
    user ? isCategorySubscribed(user.id, category.id) : Promise.resolve(false),
  ]);

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
          {user && subscriptionsOn && (
            <SubscribeButton type="category" id={category.id} initialSubscribed={subscribed} />
          )}
        </div>
      </div>

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
                thumbnailUrl={bunnyStreamThumbnailUrl(video.bunnyVideoId)}
                badge={video.memberOnly ? "Members" : undefined}
              />
            ))}
          </div>
        </section>
      )}

      {category.files.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Files</h2>
          <FileList files={category.files} isLoggedIn={Boolean(user)} />
        </section>
      )}
    </div>
  );
}
