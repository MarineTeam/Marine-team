import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { canEditCategory } from "@/lib/permissions";
import { CategoryEditForm } from "@/components/category-edit-form";
import { VideoManager } from "@/components/video-manager";
import { FileManager } from "@/components/file-manager";

export default async function CategoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [category, user] = await Promise.all([
    prisma.category.findUnique({ where: { id } }),
    getCurrentUser(),
  ]);

  if (!category || !user) notFound();
  if (!(await canEditCategory(user, category.id))) notFound();

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/categories" className="text-sm text-zinc-500 hover:underline">
          ← Categories
        </Link>
        <h1 className="text-xl font-semibold mt-1">{category.name}</h1>
      </div>

      <CategoryEditForm category={category} />

      <div>
        <p className="text-sm text-zinc-500">
          Videos and files added below skip the series layer entirely — they show directly on this
          category&apos;s page.
        </p>
      </div>
      <VideoManager categoryId={category.id} />
      <FileManager categoryId={category.id} />
    </div>
  );
}
