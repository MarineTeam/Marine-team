import Link from "next/link";

type CategoryCardData = { slug: string; name: string };

export function CategoryCard({ category }: { category: CategoryCardData }) {
  return (
    <Link
      href={`/categories/${category.slug}`}
      className="group flex w-56 sm:w-64 shrink-0 snap-start items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-white p-6 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900 aspect-video"
    >
      <h3 className="font-medium group-hover:underline">{category.name}</h3>
    </Link>
  );
}
