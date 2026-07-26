import { MenuTile } from "@/components/menu-tile";
import { bunnyStreamThumbnailUrl } from "@/lib/bunny";

type CategoryTileData = {
  slug: string;
  name: string;
  memberOnly: boolean;
  coverImageUrl: string | null;
  series: { coverImageUrl: string | null }[];
  children: { id: string }[];
  videos: { bunnyVideoId: string; thumbnailFileName: string | null }[];
  files: { id: string }[];
};

export function CategoryTile({ category }: { category: CategoryTileData }) {
  const seriesThumbnail = category.series.find((s) => s.coverImageUrl)?.coverImageUrl ?? null;
  const firstVideo = category.videos[0];
  const thumbnailUrl =
    category.coverImageUrl ??
    seriesThumbnail ??
    (firstVideo ? bunnyStreamThumbnailUrl(firstVideo.bunnyVideoId, firstVideo.thumbnailFileName) : null);
  const itemCount =
    category.series.length + category.children.length + category.videos.length + category.files.length;

  return (
    <MenuTile
      href={`/categories/${category.slug}`}
      title={category.name}
      subtitle={itemCount > 0 ? `${itemCount} ${itemCount === 1 ? "item" : "items"}` : undefined}
      thumbnailUrl={thumbnailUrl}
      badge={category.memberOnly ? "Members" : undefined}
    />
  );
}
