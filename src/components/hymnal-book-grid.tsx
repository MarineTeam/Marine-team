import Image from "next/image";
import Link from "next/link";

type HymnalBook = {
  slug: string;
  title: string;
  abbreviation: string | null;
  coverImageUrl: string | null;
  memberOnly: boolean;
  _count: { files: number };
};

// A small fixed palette rather than an arbitrary hash-to-hue: keeps every
// badge legible (readable white-on-color) instead of risking a random pale
// color that washes out.
const BADGE_COLORS = [
  "#00897B",
  "#F8961E",
  "#5C6BC0",
  "#D81B60",
  "#43A047",
  "#6D4C41",
  "#546E7A",
  "#8E24AA",
];

function badgeColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return BADGE_COLORS[Math.abs(hash) % BADGE_COLORS.length];
}

/** Grid of hymnal "book" covers for a hymnalStyle category — see Category.hymnalStyle. */
export function HymnalBookGrid({ books }: { books: HymnalBook[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {books.map((book) => (
        <Link
          key={book.slug}
          href={`/series/${book.slug}`}
          className="group flex flex-col gap-1.5"
        >
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-zinc-100 shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-lg dark:bg-zinc-800">
            {book.coverImageUrl ? (
              <Image src={book.coverImageUrl} alt="" fill unoptimized className="object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center p-3 text-center text-sm font-medium text-zinc-500 dark:text-zinc-400">
                {book.title}
              </div>
            )}
            {book.abbreviation && (
              <span
                className="absolute left-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow"
                style={{ backgroundColor: badgeColor(book.abbreviation) }}
              >
                {book.abbreviation}
              </span>
            )}
            {book.memberOnly && (
              <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                Members
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-snug group-hover:underline">{book.title}</p>
            <p className="text-xs text-zinc-500">
              {book._count.files} {book._count.files === 1 ? "hymn" : "hymns"}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
