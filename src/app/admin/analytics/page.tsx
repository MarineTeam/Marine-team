import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import { getAnalyticsSummary } from "@/lib/content";

const DAY_OPTIONS = [7, 30, 90] as const;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?returnTo=/admin/analytics");
  if (!(await hasCapability(user, "view_analytics"))) {
    return <p className="text-sm text-zinc-500">You don&apos;t have access to analytics.</p>;
  }

  const { days: daysParam } = await searchParams;
  const parsed = Number(daysParam);
  const days = (DAY_OPTIONS as readonly number[]).includes(parsed) ? parsed : 30;

  const { totalViews, topSeries, topVideos, topHymns } = await getAnalyticsSummary(days);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Analytics</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          {DAY_OPTIONS.map((option) => (
            <Link
              key={option}
              href={`/admin/analytics?days=${option}`}
              className={`rounded-md border px-2 py-1 dark:border-zinc-700 ${
                option === days ? "border-zinc-900 font-medium dark:border-white" : "border-zinc-300"
              }`}
            >
              {option} days
            </Link>
          ))}
          <a
            href={`/api/admin/analytics/export?days=${days}&format=csv`}
            className="ml-auto rounded-md border border-zinc-300 px-2 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Export CSV
          </a>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">Total views ({days} days)</p>
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
          {topVideos.map(({ video, views, completionRate }) => (
            <li key={video.id} className="p-3 flex items-center justify-between text-sm">
              <span className="truncate">{video.title}</span>
              <span className="text-zinc-500 shrink-0">
                {views} views
                {completionRate != null && ` · ${Math.round(completionRate * 100)}% watch-through`}
              </span>
            </li>
          ))}
          {topVideos.length === 0 && <li className="p-3 text-sm text-zinc-500">No views recorded yet.</li>}
        </ul>
        <p className="text-xs text-zinc-500">
          Watch-through is the share of this window&apos;s viewers (by heartbeat progress) who reached
          the end of the video — not shown when nobody&apos;s progress was recorded in the window.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Most looked-up hymns
        </h2>
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
          {topHymns.map((hymn) => (
            <li key={hymn.key} className="p-3 flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="block truncate">{hymn.title}</span>
                {hymn.book && <span className="block truncate text-xs text-zinc-500">{hymn.book}</span>}
              </span>
              <span className="text-zinc-500 shrink-0">{hymn.lookups} opened</span>
            </li>
          ))}
          {topHymns.length === 0 && (
            <li className="p-3 text-sm text-zinc-500">No hymns opened in this window yet.</li>
          )}
        </ul>
        <p className="text-xs text-zinc-500">
          Counted when a hymn is actually opened — its own page, a book opened at its number, or
          put on the projector. Counted in the browser rather than when a page renders, because
          hovering a link prefetches it; so a blocked request means an opening goes uncounted
          rather than a hover being counted as one.
        </p>
      </section>
    </div>
  );
}
