import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { canEditSeries } from "@/lib/permissions";
import { getDraft } from "@/lib/drafts";
import { SeriesEditForm } from "@/components/series-edit-form";
import { VideoManager } from "@/components/video-manager";
import { FileManager } from "@/components/file-manager";
import { ViewerAccessManager } from "@/components/viewer-access-manager";

export default async function SeriesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [series, categories, user] = await Promise.all([
    prisma.series.findUnique({ where: { id } }),
    prisma.category.findMany({ orderBy: { position: "asc" } }),
    getCurrentUser(),
  ]);

  if (!series || !user) notFound();
  if (!(await canEditSeries(user, series))) notFound();
  const draft = await getDraft("series", series.id);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/series" className="text-sm text-zinc-500 hover:underline">
          ← Series
        </Link>
        <h1 className="text-xl font-semibold mt-1">{series.title}</h1>
      </div>

      <SeriesEditForm
        series={series}
        categories={categories}
        initialDraft={draft ? { data: draft.data as Record<string, unknown>, updatedAt: draft.updatedAt.toISOString() } : null}
      />
      <ViewerAccessManager type="series" id={series.id} />
      <VideoManager seriesId={series.id} />
      <FileManager seriesId={series.id} />
    </div>
  );
}
