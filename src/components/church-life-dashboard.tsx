"use client";

import { useEffect, useState } from "react";

type Dashboard = {
  attendance: {
    average: { mean: number; weeksCounted: number; weeksMissing: number } | null;
    trend: string;
    childrenShare: number | null;
    missingWeeks: number;
  };
  checkin?: { on: string; children: number } | null;
  groups?: { active: number; meetingsLast30: number };
  giving?: { last30: number; currency: string; perHead: number | null };
  followUps?: { open: number; overdue: number; unassigned: number };
};

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(
    minor / 100,
  );

function Tile({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  href: string;
}) {
  return (
    <a href={href} className="block rounded-lg border border-sep px-3 py-2 hover:border-accent">
      <p className="text-xs text-sec">{label}</p>
      <p className="mt-0.5 text-xl text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ter">{hint}</p>}
    </a>
  );
}

/**
 * Church life on one page.
 *
 * Every tile is a link to the thing it counts: a number on a dashboard that
 * cannot be opened is a number nobody can check, and a figure nobody can check
 * is one that gets quoted wrongly in a meeting.
 *
 * Sections the viewer may not see are absent from the payload entirely rather
 * than sent as null, so there is nothing here to render — see the API route.
 */
export function ChurchLifeDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/admin/dashboard");
      if (!response.ok) return setError("Couldn't load the numbers.");
      setData(await response.json());
    })();
  }, []);

  if (error) return <p className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-sec">Loading…</p>;

  const { attendance } = data;

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink">{attendance.trend}</p>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Tile
          label="People on a Sunday"
          value={attendance.average ? String(Math.round(attendance.average.mean)) : "Not counted"}
          hint={
            attendance.average
              ? `over ${attendance.average.weeksCounted} counted week${attendance.average.weeksCounted === 1 ? "" : "s"}`
              : "nobody has written a count down yet"
          }
          href="/admin/attendance"
        />

        {attendance.childrenShare !== null && (
          <Tile
            label="Of whom children"
            value={`${Math.round(attendance.childrenShare * 100)}%`}
            hint="from the weeks counted in two parts"
            href="/admin/attendance"
          />
        )}

        {data.checkin && (
          <Tile
            label="Children signed in"
            value={String(data.checkin.children)}
            hint={`on ${data.checkin.on}`}
            href="/admin/checkin"
          />
        )}

        {data.groups && (
          <Tile
            label="In a small group"
            value={String(data.groups.active)}
            hint={`${data.groups.meetingsLast30} meetings in the last 30 days`}
            href="/admin/groups"
          />
        )}

        {data.giving && (
          <Tile
            label="Given in 30 days"
            value={money(data.giving.last30, data.giving.currency)}
            hint={
              data.giving.perHead === null
                ? "no headcount to divide by"
                : `${money(data.giving.perHead, data.giving.currency)} a head`
            }
            href="/admin/giving"
          />
        )}

        {data.followUps && (
          <Tile
            label="Follow-ups open"
            value={String(data.followUps.open)}
            hint={
              [
                data.followUps.overdue > 0 ? `${data.followUps.overdue} overdue` : null,
                data.followUps.unassigned > 0 ? `${data.followUps.unassigned} unclaimed` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "all in hand"
            }
            href="/admin/follow-ups"
          />
        )}
      </div>

      {attendance.missingWeeks > 0 && (
        <p className="text-xs text-amber-700">
          {attendance.missingWeeks} week{attendance.missingWeeks === 1 ? "" : "s"} in the last six
          months have no count. Every figure above that divides by a congregation is only as good
          as those.
        </p>
      )}
    </div>
  );
}
