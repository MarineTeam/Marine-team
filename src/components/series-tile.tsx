import { MenuRow, MenuTile } from "@/components/menu-tile";

type SeriesTileData = {
  slug: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  memberOnly: boolean;
  tags?: string[];
};

export function SeriesTile({
  series,
  variant = "card",
}: {
  series: SeriesTileData;
  /** "row" flattens it for a grouped panel — see menu-tile.tsx. */
  variant?: "card" | "row";
}) {
  const Component = variant === "row" ? MenuRow : MenuTile;

  return (
    <Component
      href={`/series/${series.slug}`}
      title={series.title}
      subtitle={series.description}
      thumbnailUrl={series.coverImageUrl}
      badge={series.memberOnly ? "Members" : undefined}
      tags={series.tags}
    />
  );
}
