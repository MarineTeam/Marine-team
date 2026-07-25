import { MenuTile } from "@/components/menu-tile";

type SeriesTileData = {
  slug: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  memberOnly: boolean;
};

export function SeriesTile({ series }: { series: SeriesTileData }) {
  return (
    <MenuTile
      href={`/series/${series.slug}`}
      title={series.title}
      subtitle={series.description}
      thumbnailUrl={series.coverImageUrl}
      badge={series.memberOnly ? "Members" : undefined}
    />
  );
}
