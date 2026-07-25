import { CategoryCard } from "@/components/category-card";

type CategoryCardData = { id: string; slug: string; name: string };

export function CategoryRow({ categories }: { categories: CategoryCardData[] }) {
  if (categories.length === 0) return null;

  return (
    <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory px-4 sm:px-0 pb-2 -mx-4 sm:mx-0 scrollbar-thin">
      {categories.map((category) => (
        <CategoryCard key={category.id} category={category} />
      ))}
    </div>
  );
}
