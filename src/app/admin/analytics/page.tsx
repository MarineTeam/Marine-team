import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import { getAnalyticsSummary } from "@/lib/content";

export default async function AnalyticsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?returnTo=/admin/analytics");
  if (!(await hasCapability(user, "view_analytics"))) {
    return <p className="text-sm text-zinc-500">You don&apos;t have access to analytics.</p>;
  }

  const { totalViews, topSeries, topVideos } = await getAnalyticsSummary(30);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Analytics</h1>
        <p className="text-sm text-zinc-500">View activity over the last 30 days.</p>
      </div>

      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">Total views (30 days)</p>
        <p className="text-3xl font-semibold">{totalViews.toLocaleString()}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Top series</h2>
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
          {topSeries.map(({ series, views }) => (
            <li key={series.id} className="p-3 flex items-center justify-between text-sm">
              <span className="truncate">{series.title}</span>
              <span className="text-zinc-500 shrink-0">{views} views</span>
            </li>
          ))}
          {topSeries.length === 0 && <li className="p-3 text-sm text-zinc-500">No views recorded yet.</li>}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">Top videos</h2>
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
          {topVideos.map(({ video, views }) => (
            <li key={video.id} className="p-3 flex items-center justify-between text-sm">
              <span className="truncate">{video.title}</span>
              <span className="text-zinc-500 shrink-0">{views} views</span>
            </li>
          ))}
          {topVideos.length === 0 && <li className="p-3 text-sm text-zinc-500">No views recorded yet.</li>}
        </ul>
      </section>
    </div>
  );
}
