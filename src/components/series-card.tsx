import Link from "next/link";
import type { Series } from "@prisma/client";

export function SeriesCard({ series }: { series: Series }) {
  return (
    <Link
      href={`/series/${series.slug}`}
      className="group block overflow-hidden rounded-lg border border-zinc-200 bg-white transition hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="aspect-video bg-zinc-100 dark:bg-zinc-800">
        {series.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={series.coverImageUrl}
            alt={series.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-400 text-sm">
            No cover image
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2">
          <h3 className="font-medium group-hover:underline">{series.title}</h3>
          {series.memberOnly && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              Members
            </span>
          )}
        </div>
        {series.description && (
          <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{series.description}</p>
        )}
      </div>
    </Link>
  );
}
