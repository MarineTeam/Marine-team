import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { eventWhen, listPublishedEvents, placesLeft, registrationState } from "@/lib/events";
import { format } from "@/lib/i18n";
import { currentMessages } from "@/lib/i18n/locale";
import { isPluginEnabled } from "@/lib/plugins";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Events",
  description: "What's on, and how to sign up.",
};

/** What's on, soonest first. Past events drop off rather than being paged through. */
export default async function EventsPage() {
  if (!(await isPluginEnabled("events"))) notFound();
  const [user, { t }] = await Promise.all([getCurrentUser(), currentMessages()]);
  const events = await listPublishedEvents({ memberOnly: Boolean(user) });

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">{t.events.title}</h1>
        <p className="mt-1 text-sm text-sec">{t.events.subtitle}</p>
        <p className="mt-2 text-sm">
          {/* A plain link, not a button: subscribing is the browser's job, and
              a phone offered an .ics URL knows what to do with it. */}
          <a href="/events/calendar.ics" className="text-accent hover:underline">
            {t.events.subscribeToCalendar}
          </a>
        </p>
      </div>

      {events.length === 0 ? (
        <p className="rounded-lg border border-dashed border-sep p-8 text-center text-sm text-sec">
          {t.events.nothingComingUp}
        </p>
      ) : (
        <ul className="divide-y divide-sep rounded-lg border border-sep">
          {events.map((event) => {
            const state = registrationState(event, event.taken);
            const left = placesLeft(event, event.taken);
            return (
              <li key={event.id}>
                <Link href={`/events/${event.slug}`} className="block px-4 py-3 hover:bg-hover">
                  <span className="block text-sm font-medium text-ink">{event.title}</span>
                  <span className="block text-xs text-sec">
                    {[eventWhen(event), event.location].filter(Boolean).join(" · ")}
                  </span>
                  {state !== "off" && (
                    <span className="mt-0.5 block text-xs text-ter">
                      {state === "waitlist-only"
                        ? t.events.fullWaitlist
                        : state === "full"
                          ? t.events.full
                          : state === "closed"
                            ? t.events.signUpClosed
                            : state === "not-open-yet"
                              ? t.events.signUpNotOpen
                              : left === null
                                ? t.events.signUpOpen
                                : left === 1
                                  ? t.events.onePlaceLeft
                                  : format(t.events.placesLeft, { count: left })}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
