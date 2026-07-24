import type { Series } from "@prisma/client";
import { SeriesCard } from "@/components/series-card";

export function SeriesRow({ title, series }: { title: string; series: Series[] }) {
  if (series.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3 px-4 sm:px-0">{title}</h2>
      <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory px-4 sm:px-0 pb-2 -mx-4 sm:mx-0 scrollbar-thin">
        {series.map((s) => (
          <SeriesCard key={s.id} series={s} />
        ))}
      </div>
    </section>
  );
}
