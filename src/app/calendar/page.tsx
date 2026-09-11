import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { isPluginEnabled } from "@/lib/plugins";
import { listEvents, listPeople, listPublicSchedules } from "@/lib/schedules/query";
import { canSeeNames, NAMES_WITHHELD, visibleEvents, visiblePeople } from "@/lib/schedules/visibility";
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
 * The rotas: the dates for everybody, the names for members.
 *
 * The calendar app this came from had no login at all — whoever opened it
 * picked their name once and saw what they were on for — and that put every
 * volunteer's name beside the days they are at the building, for anyone with
 * the URL. The port kept the "pick your name once on this device" part, and
 * moved it behind a sign-in. Signed out, the page still shows which rotas
 * exist and when; it is `visibleEvents`/`visiblePeople` that decide, so the
 * names are absent from what this page is handed rather than hidden by it.
 */
export default async function CalendarPage() {
  if (!(await isPluginEnabled("schedules"))) notFound();

  const [user, schedules, allEvents, allPeople] = await Promise.all([
    getCurrentUser(),
    listPublicSchedules(),
    listEvents({}),
    listPeople(),
  ]);
  const viewer = { signedIn: user !== null };
  const events = visibleEvents(allEvents, viewer);
  const people = visiblePeople(allPeople, viewer);
  const namesWithheld = !canSeeNames(viewer);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">Calendar</h1>
        <p className="mt-2 text-sec">
          {schedules.length === 0 ? (
            "No schedules have been set up yet."
          ) : namesWithheld ? (
            <>
              {NAMES_WITHHELD}{" "}
              <Link href="/auth/login?returnTo=/calendar" className="text-accent hover:underline">
                Sign in
              </Link>
            </>
          ) : (
            "Choose your name to see what you're on for."
          )}
        </p>
      </div>

      {schedules.length > 0 && (
        <>
          <CalendarView
            schedules={schedules}
            events={events}
            people={people}
            namesWithheld={namesWithheld}
          />
          <SaveCalendarButton />
        </>
      )}
    </div>
  );
}
