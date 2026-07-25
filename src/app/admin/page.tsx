import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

export default async function AdminOverview() {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") redirect("/admin/series");

  const [categories, series, videos, files] = await Promise.all([
    prisma.category.count(),
    prisma.series.count(),
    prisma.video.count(),
    prisma.fileAsset.count(),
  ]);

  const stats = [
    { label: "Categories", value: categories },
    { label: "Series", value: series },
    { label: "Videos", value: videos },
    { label: "Files", value: files },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Admin Overview</h1>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4"
          >
            <p className="text-2xl font-semibold">{stat.value}</p>
            <p className="text-sm text-zinc-500">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
