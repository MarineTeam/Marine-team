import { MenuTile } from "@/components/menu-tile";

type CategoryTileData = {
  slug: string;
  name: string;
  series: { coverImageUrl: string | null }[];
  children: { id: string }[];
};

export function CategoryTile({ category }: { category: CategoryTileData }) {
  const thumbnailUrl = category.series.find((s) => s.coverImageUrl)?.coverImageUrl ?? null;
  const itemCount = category.series.length + category.children.length;

  return (
    <MenuTile
      href={`/categories/${category.slug}`}
      title={category.name}
      subtitle={itemCount > 0 ? `${itemCount} ${itemCount === 1 ? "item" : "items"}` : undefined}
      thumbnailUrl={thumbnailUrl}
    />
  );
}
