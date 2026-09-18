import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import { isPluginEnabled } from "@/lib/plugins";
import { listSessions } from "@/lib/checkin-query";
import { todayIso, formatIsoDate } from "@/lib/dates";
import { CheckinSessions } from "@/components/checkin-sessions";

/** The rooms open today. */
export const dynamic = "force-dynamic";

export default async function AdminCheckinPage() {
  if (!(await isPluginEnabled("checkin"))) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?returnTo=/admin/checkin");
  if (!(await hasCapability(user, "run_checkin"))) {
    return <p className="text-sm text-zinc-500">You don&apos;t have access to this.</p>;
  }

  const today = todayIso();
  const sessions = await listSessions(today);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Check-in · {formatIsoDate(today)}</h1>
        <p className="mt-1 text-sm text-sec">
          A child is released when the code on the ticket matches the one on their label{" "}
          <em>and</em> the person collecting is an adult of their household. A leader can override
          that, in writing, and it is recorded.
        </p>
      </div>

      {sessions.length > 0 && (
        <ul className="space-y-2">
          {sessions.map((session) => (
            <li key={session.id}>
              <Link
                href={`/admin/checkin/${session.id}`}
                className="flex items-baseline justify-between rounded-lg border border-sep px-3 py-2 hover:border-accent"
              >
                <span className="font-medium text-ink">
                  {session.name}
                  {session.room ? <span className="text-sec"> · {session.room}</span> : null}
                </span>
                <span className="text-xs text-sec">
                  {session.closedAt ? "closed" : `${session.checkedIn} checked in`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <CheckinSessions today={today} hasSessions={sessions.length > 0} />
    </div>
  );
}
