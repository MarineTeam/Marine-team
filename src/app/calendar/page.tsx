import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isPluginEnabled } from "@/lib/plugins";
import { listEvents, listPeople, listPublicSchedules } from "@/lib/schedules/query";
import { CalendarView } from "@/components/calendar-view";
import { SaveCalendarButton } from "@/components/save-calendar-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Calendar",
  // The calendar carries people's names, so it stays out of search results
  // even though anyone with the URL can read it. Same call the calendar app
  // made, for the same reason.
  robots: { index: false, follow: false },
};

/**
 * The rotas, for everybody.
 *
 * No login: whoever opens it picks their name once on that device and sees
 * what they are on for. That was the calendar app's central requirement —
 * most people on a church rota have no account and are not going to make one
 * — and it survives the port intact.
 */
export default async function CalendarPage() {
  if (!(await isPluginEnabled("schedules"))) notFound();

  const [schedules, events, people] = await Promise.all([
    listPublicSchedules(),
    listEvents({}),
    listPeople(),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">Calendar</h1>
        <p className="mt-2 text-sec">
          {schedules.length === 0
            ? "No schedules have been set up yet."
            : "Choose your name to see what you're on for."}
        </p>
      </div>

      {schedules.length > 0 && (
        <>
          <CalendarView schedules={schedules} events={events} people={people} />
          <SaveCalendarButton />
        </>
      )}
    </div>
  );
}
