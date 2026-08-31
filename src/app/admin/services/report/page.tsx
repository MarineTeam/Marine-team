import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import { songsSungBetween } from "@/lib/services";

/** The window a licence return usually covers, and what the box starts on. */
function defaultRange(): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today);
  from.setMonth(from.getMonth() - 6);
  return { from: from.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) };
}

/** A date typed into the URL, or null — never a silent Invalid Date. */
function parseDay(value: string | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : null;
}

/**
 * What was sung, for a licence return.
 *
 * Churches report each song they used and how often, and the numbers come off
 * the running orders that were already built here — so this is a reading of
 * data the app has rather than a new thing to keep up to date.
 */
export default async function SongReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?returnTo=/admin/services/report");
  if (!(await hasCapability(user, "manage_files"))) {
    return <p className="text-sm text-zinc-500">You don&apos;t have access to this report.</p>;
  }

  const { from: fromParam, to: toParam } = await searchParams;
  const fallback = defaultRange();
  const from = parseDay(fromParam) ?? fallback.from;
  const to = parseDay(toParam) ?? fallback.to;

  // The end of the chosen day, not its start: a service on the last day of
  // the window is inside it.
  const songs = await songsSungBetween(new Date(`${from}T00:00:00.000Z`), new Date(`${to}T23:59:59.999Z`));
  const occasions = songs.reduce((total, song) => total + song.times, 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/services" className="text-sm text-zinc-500 hover:underline">
          ← Services
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-ink">What we sang</h1>
        <p className="mt-1 text-sm text-sec">
          Every song in a service plan dated inside the window, and how many services it was sung
          in — the shape a CCLI or similar licence return asks for. Counted from the plans
          themselves, published or not: a plan that never got published was still sung, and
          under-reporting a licence return is the worse mistake.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 text-sm">
        <label className="space-y-1">
          <span className="block text-xs text-sec">From</span>
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="rounded-md border border-sep px-2 py-1.5"
          />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-sec">To</span>
          <input type="date" name="to" defaultValue={to} className="rounded-md border border-sep px-2 py-1.5" />
        </label>
        <button type="submit" className="rounded-md border border-sep px-3 py-1.5 hover:bg-hover">
          Show
        </button>
        <a
          href={`/api/admin/services/report?from=${from}&to=${to}`}
          className="ml-auto rounded-md border border-sep px-3 py-1.5 hover:bg-hover"
        >
          Export CSV
        </a>
      </form>

      <p className="text-sm text-sec">
        {songs.length} song{songs.length === 1 ? "" : "s"} · {occasions} time
        {occasions === 1 ? "" : "s"} sung
      </p>

      <div className="overflow-x-auto rounded-lg border border-sep">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-ter">
            <tr className="border-b border-sep">
              <th className="p-3 font-medium">Song</th>
              <th className="p-3 font-medium">CCLI</th>
              <th className="p-3 font-medium">Words &amp; music</th>
              <th className="p-3 font-medium">Copyright</th>
              <th className="p-3 text-right font-medium">Times</th>
            </tr>
          </thead>
          <tbody>
            {songs.map((song) => (
              <tr key={song.key} className="border-b border-sep last:border-0 align-top">
                <td className="p-3">
                  <span className="block">
                    {song.number === null ? song.title : `${song.number}. ${song.title}`}
                  </span>
                  {song.book && <span className="block text-xs text-sec">{song.book}</span>}
                  <span className="block text-xs text-ter">{song.dates.join(", ")}</span>
                </td>
                {/* An empty cell is the point of the report as much as a full
                    one: it is the song somebody has to go and look up before
                    the return can be filed. */}
                <td className="p-3">{song.ccliNumber ?? <span className="text-ter">—</span>}</td>
                <td className="p-3">{song.author ?? <span className="text-ter">—</span>}</td>
                <td className="p-3">{song.copyright ?? <span className="text-ter">—</span>}</td>
                <td className="p-3 text-right tabular-nums">{song.times}</td>
              </tr>
            ))}
            {songs.length === 0 && (
              <tr>
                <td colSpan={5} className="p-3 text-sm text-sec">
                  No service plans dated in this window.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
