/**
 * What an admin screen shows before it has anything to show.
 *
 * Extracted because ten components had the same bug: the error was rendered
 * *after* an early `if (!data) return <Loading />`, and `data` stays null when
 * the load is what failed — so a first load that failed left the screen saying
 * "Loading…" for ever and never said why. A network blip, a 500, and a
 * capability revoked mid-session all looked exactly like a slow connection.
 *
 * Three others (people, teams, schedules) were already right: they hold a
 * separate `loading` flag cleared in a `finally`, so a failure falls through to
 * the body and shows the message. Their shape works; this one is less easy to
 * get wrong, because the error cannot be ordered after the thing that hides it.
 *
 * Called at the point where there is nothing to render, which is why it takes
 * no `loaded` flag: reaching it *is* the flag. An error there wins over the
 * spinner, which is the whole fix.
 */
export function LoadState({ error }: { error: string | null }) {
  if (error) return <Problem>{error}</Problem>;
  return <p className="text-sm text-sec">Loading…</p>;
}

/**
 * A problem worth interrupting for.
 *
 * `role="alert"` so a screen reader is told rather than left to find it: the
 * text appears without the reader having moved, which is precisely the case
 * the role exists for.
 */
export function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-600"
      role="alert"
    >
      {children}
    </p>
  );
}
