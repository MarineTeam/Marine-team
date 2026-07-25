import Link from "next/link";
import type { Series } from "@prisma/client";
import { SeriesCard } from "@/components/series-card";

export function SeriesRow({
  title,
  href,
  series,
}: {
  title: string;
  href?: string;
  series: Series[];
}) {
  if (series.length === 0) return null;

  return (
    <section>
      <div className="mb-3 px-4 sm:px-0">
        {href ? (
          <Link href={href} className="text-lg font-semibold hover:underline">
            {title} <span aria-hidden>→</span>
          </Link>
        ) : (
          <h2 className="text-lg font-semibold">{title}</h2>
        )}
      </div>
      <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory px-4 sm:px-0 pb-2 -mx-4 sm:mx-0 scrollbar-thin">
        {series.map((s) => (
          <SeriesCard key={s.id} series={s} />
        ))}
      </div>
    </section>
  );
}
