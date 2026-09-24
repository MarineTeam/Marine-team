import type { User } from "@prisma/client";
import { ApiError } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/current-user";
import { addIsoDays, fromIsoDate, toIsoDate, todayIso, type IsoDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { hasCapability } from "@/lib/permissions";
import {
  averageOf,
  childrenShare,
  knownGatherings,
  oddness,
  trendLabel,
  trendOf,
  uncountedWeeks,
  weeklySeries,
  worthChasing,
  type CountRow,
} from "@/lib/service-attendance";

/**
 * Headcounts, and the church-life dashboard built on them.
 *
 * The rules are in `service-attendance.ts`. What this file adds is the two
 * capabilities either side of the feature — taking a count is keeping the
 * diary, reading the numbers is analytics — and the assembly of the dashboard,
 * which is where the interesting rule lives.
 *
 * **The dashboard omits what the viewer may not see, rather than blanking it.**
 * Giving is behind `manage_giving` and the follow-up queue behind
 * `manage_people`; somebody with neither gets a payload with no `giving` and no
 * `followUps` key at all. The same structural privacy as the discussion guides
 * and the group rolls: a page cannot render a figure it was never handed, and
 * a key that is merely null still tells you the money exists and how curious
 * to be about it.
 */

export async function requireCounter(): Promise<User> {
  const user = await getCurrentUser();
  if (!user || !(await hasCapability(user, "manage_events"))) {
    throw new ApiError(404, "not_found", "Not found");
  }
  return user;
}

export async function requireNumbers(): Promise<User> {
  const user = await getCurrentUser();
  if (!user || !(await hasCapability(user, "view_analytics"))) {
    throw new ApiError(404, "not_found", "Not found");
  }
  return user;
}

function asRow(row: {
  date: Date;
  gathering: string;
  adults: number | null;
  children: number | null;
  visitors: number | null;
  note: string | null;
}): CountRow {
  return { ...row, date: toIsoDate(row.date) };
}

/** Every count in a span, oldest first. */
export async function counts(from: IsoDate, to: IsoDate): Promise<CountRow[]> {
  const rows = await prisma.serviceAttendance.findMany({
    where: { date: { gte: fromIsoDate(from), lte: fromIsoDate(to) } },
    orderBy: [{ date: "asc" }, { gathering: "asc" }],
    select: { date: true, gathering: true, adults: true, children: true, visitors: true, note: true },
  });
  return rows.map(asRow);
}

export type CountInput = {
  date: IsoDate;
  gathering: string;
  adults: number | null;
  children: number | null;
  visitors: number | null;
  note?: string | null;
};

/**
 * Records a count, or corrects one already taken.
 *
 * Upserted on (date, gathering): a second steward submitting the same service
 * corrects the first rather than adding a second congregation to the chart.
 *
 * The oddness check is returned alongside rather than raised: it is advisory,
 * and Easter really is three times a normal Sunday.
 */
export async function recordCount(input: CountInput, byEmail: string) {
  const gathering = input.gathering.trim();
  if (!gathering) throw new ApiError(400, "needs_gathering", "Which service was this?");
  if (input.adults === null && input.children === null) {
    throw new ApiError(400, "needs_a_number", "Write down at least one number, or don't record the week.");
  }
  for (const value of [input.adults, input.children, input.visitors]) {
    if (value !== null && (!Number.isInteger(value) || value < 0)) {
      throw new ApiError(400, "bad_number", "A headcount is a whole number of people.");
    }
  }
  if (input.date > todayIso()) {
    throw new ApiError(400, "future", "You can't count a service that hasn't happened.");
  }

  const recent = weeklySeries(
    await counts(addIsoDays(input.date, -70), addIsoDays(input.date, -1)),
    addIsoDays(input.date, -70),
    addIsoDays(input.date, -1),
  );
  const warning = oddness(input, recent);

  const data = {
    adults: input.adults,
    children: input.children,
    visitors: input.visitors,
    note: input.note?.trim() || null,
    countedByEmail: byEmail,
  };
  const row = await prisma.serviceAttendance.upsert({
    where: { date_gathering: { date: fromIsoDate(input.date), gathering } },
    create: { date: fromIsoDate(input.date), gathering, ...data },
    update: data,
  });

  return { count: { id: row.id }, warning };
}

export async function removeCount(id: string): Promise<void> {
  const { count } = await prisma.serviceAttendance.deleteMany({ where: { id } });
  if (count === 0) throw new ApiError(404, "not_found", "Not found");
}

export type AttendanceView = {
  from: IsoDate;
  to: IsoDate;
  series: ReturnType<typeof weeklySeries>;
  average: ReturnType<typeof averageOf>;
  trend: string;
  childrenShare: number | null;
  missing: IsoDate[];
  /** Only the gaps still worth filling in — see `worthChasing`. */
  chase: IsoDate[];
  gatherings: string[];
  recent: CountRow[];
};

/** The attendance page: the chart, the trend, and what nobody has counted. */
export async function attendanceView(weeks = 26, today: IsoDate = todayIso()): Promise<AttendanceView> {
  const from = addIsoDays(today, -weeks * 7);
  const rows = await counts(from, today);
  const series = weeklySeries(rows, from, today);
  const missing = uncountedWeeks(series);

  return {
    from,
    to: today,
    series,
    average: averageOf(series.slice(-8)),
    trend: trendLabel(trendOf(series)),
    childrenShare: childrenShare(rows),
    missing,
    chase: missing.filter((week) => worthChasing(week, today)),
    gatherings: knownGatherings(rows),
    recent: rows.slice(-20).reverse(),
  };
}

export type Dashboard = {
  attendance: {
    average: ReturnType<typeof averageOf>;
    trend: string;
    childrenShare: number | null;
    missingWeeks: number;
  };
  /** The most recent day a session ran, and how many were signed in. */
  checkin?: { on: IsoDate; children: number } | null;
  groups?: { active: number; meetingsLast30: number };
  giving?: { last30: number; currency: string; perHead: number | null };
  followUps?: { open: number; overdue: number; unassigned: number };
};

/**
 * Church life on one page.
 *
 * Each section is present only if this viewer may see it — see the file
 * comment. The attendance block is always there, because it names nobody and
 * `view_analytics` is what got them to this page at all.
 */
export async function dashboard(user: User, today: IsoDate = todayIso()): Promise<Dashboard> {
  const from = addIsoDays(today, -26 * 7);
  const rows = await counts(from, today);
  const series = weeklySeries(rows, from, today);
  const average = averageOf(series.slice(-8));

  const view: Dashboard = {
    attendance: {
      average,
      trend: trendLabel(trendOf(series)),
      childrenShare: childrenShare(rows),
      missingWeeks: uncountedWeeks(series).length,
    },
  };

  const [seesGiving, seesPeople, seesEvents] = await Promise.all([
    hasCapability(user, "manage_giving"),
    hasCapability(user, "manage_people"),
    hasCapability(user, "manage_events"),
  ]);

  if (seesEvents) {
    const since = fromIsoDate(addIsoDays(today, -30));
    const [active, meetings] = await Promise.all([
      prisma.smallGroupMember.count({ where: { status: "ACTIVE" } }),
      prisma.smallGroupMeeting.count({ where: { date: { gte: since }, cancelled: false } }),
    ]);
    view.groups = { active, meetingsLast30: meetings };

    // The most recent day anybody actually ran a session, not "the last 30
    // days" — a fortnight's children added together is not a number anybody
    // wants under a heading that says last Sunday.
    const latest = await prisma.checkinSession.findFirst({
      where: { date: { gte: since } },
      orderBy: { date: "desc" },
      select: { date: true },
    });
    view.checkin = latest
      ? {
          on: toIsoDate(latest.date),
          children: await prisma.checkinRecord.count({ where: { session: { date: latest.date } } }),
        }
      : null;
  }

  if (seesGiving) {
    const gifts = await prisma.gift.findMany({
      where: { status: "SETTLED", givenAt: { gte: fromIsoDate(addIsoDays(today, -30)) } },
      select: { amount: true, currency: true },
    });
    const last30 = gifts.reduce((sum, gift) => sum + gift.amount, 0);
    view.giving = {
      last30,
      currency: gifts[0]?.currency ?? "GBP",
      // Per head only where there is a head count to divide by: the whole
      // reason attendance is worth keeping, and null rather than a division
      // by an assumed congregation.
      perHead: average && average.mean > 0 ? Math.round(last30 / average.mean) : null,
    };
  }

  if (seesPeople) {
    const [open, overdue, unassigned] = await Promise.all([
      prisma.followUp.count({ where: { status: "OPEN" } }),
      prisma.followUp.count({ where: { status: "OPEN", dueOn: { lt: fromIsoDate(today) } } }),
      prisma.followUp.count({ where: { status: "OPEN", assignedToId: null } }),
    ]);
    view.followUps = { open, overdue, unassigned };
  }

  return view;
}
