import type { Series } from "@prisma/client";
import { SeriesCard } from "@/components/series-card";

export function SeriesRow({ series }: { series: Series[] }) {
  if (series.length === 0) return null;

  return (
    <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory px-4 sm:px-0 pb-2 -mx-4 sm:mx-0 scrollbar-thin">
      {series.map((s) => (
        <SeriesCard key={s.id} series={s} />
      ))}
    </div>
  );
}
