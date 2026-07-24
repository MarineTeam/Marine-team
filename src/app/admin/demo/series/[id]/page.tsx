import Link from "next/link";
import { notFound } from "next/navigation";
import { demoPrisma } from "@/lib/demo-db";
import { SeriesEditForm } from "@/components/series-edit-form";
import { VideoManager } from "@/components/video-manager";
import { FileManager } from "@/components/file-manager";

export default async function DemoSeriesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [series, categories] = await Promise.all([
    demoPrisma.series.findUnique({ where: { id } }),
    demoPrisma.category.findMany({ orderBy: { position: "asc" } }),
  ]);

  if (!series) notFound();

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/demo/series" className="text-sm text-zinc-500 hover:underline">
          ← Series
        </Link>
        <h1 className="text-xl font-semibold mt-1">{series.title}</h1>
      </div>

      <SeriesEditForm series={series} categories={categories} />
      <VideoManager seriesId={series.id} />
      <FileManager seriesId={series.id} />
    </div>
  );
}
