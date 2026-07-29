import Image from "next/image";
import Link from "next/link";
import type { Series } from "@prisma/client";

export function HeroBanner({ series }: { series: Series }) {
  return (
    <Link
      href={`/series/${series.slug}`}
      className="group relative block h-64 sm:h-80 w-full overflow-hidden bg-zinc-900"
    >
      {series.coverImageUrl && (
        // Cover images are a freeform admin-pasted URL (see series-edit-form) —
        // unoptimized, see next.config.ts.
        <Image
          src={series.coverImageUrl}
          alt=""
          fill
          unoptimized
          priority
          className="object-cover opacity-70 transition group-hover:opacity-60 group-hover:scale-105"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <div className="relative flex h-full max-w-6xl mx-auto flex-col justify-end px-4 pb-8">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-zinc-300 uppercase tracking-wide">Featured</p>
          {series.memberOnly && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
              Members
            </span>
          )}
        </div>
        <h1 className="mt-1 text-2xl sm:text-4xl font-semibold text-white tracking-tight">
          {series.title}
        </h1>
        {series.description && (
          <p className="mt-2 max-w-2xl text-zinc-200 line-clamp-2">{series.description}</p>
        )}
        <span className="mt-4 inline-flex w-fit items-center rounded-md bg-white px-4 py-2 text-sm font-medium text-zinc-900 group-hover:bg-zinc-200">
          Watch now
        </span>
      </div>
    </Link>
  );
}
