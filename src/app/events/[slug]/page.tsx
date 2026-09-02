import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventSignup } from "@/components/event-signup";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import {
  eventWhen,
  getEventBySlug,
  placesLeft,
  registrationMessage,
  registrationState,
} from "@/lib/events";
import { describeSeries, shapeOf } from "@/lib/event-series";
import { currentMessages } from "@/lib/i18n/locale";
import { isPluginEnabled } from "@/lib/plugins";
import { getDisplayName } from "@/lib/profile";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const event = await getEventBySlug(slug);
  if (!event || !event.published) return { title: "Event" };
  return {
    title: event.title,
    description: event.description?.slice(0, 200) ?? undefined,
    // A members-only event is listed to members and nobody else; keeping it
    // out of search results is the other half of that.
    ...(event.memberOnly ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function EventPage(props: { params: Promise<{ slug: string }> }) {
  if (!(await isPluginEnabled("events"))) notFound();
  const { slug } = await props.params;
  const event = await getEventBySlug(slug);
  if (!event || !event.published) notFound();

  const [user, { t }] = await Promise.all([getCurrentUser(), currentMessages()]);
  // Not a 403: a members-only event should be indistinguishable from one that
  // doesn't exist, or the title itself leaks.
  if (event.memberOnly && !user) notFound();

  const mine = user
    ? await prisma.eventRegistration.findUnique({
        where: { eventId_userId: { eventId: event.id, userId: user.id } },
      })
    : null;

  const state = registrationState(event, event.taken);
  const left = placesLeft(event, event.taken);

  // When this is one date of a repeating thing, say so and offer the next few.
  // A member who has found the wrong week should not have to go back to the
  // list and count — and somebody who has just missed one wants to know when
  // the next is more than anything else on the page.
  const series = event.seriesId
    ? await prisma.eventSeries.findUnique({ where: { id: event.seriesId } })
    : null;
  const alsoOn = series
    ? await prisma.event.findMany({
        where: {
          seriesId: series.id,
          published: true,
          id: { not: event.id },
          startsAt: { gte: new Date() },
        },
        orderBy: { startsAt: "asc" },
        take: 4,
        select: { slug: true, title: true, startsAt: true, endsAt: true, allDay: true },
      })
    : [];

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <p className="text-sm">
        <Link href="/events" className="text-accent hover:underline">
          ← {t.events.title}
        </Link>
      </p>

      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink">{event.title}</h1>
        <p className="mt-1 text-sm text-sec">{eventWhen(event)}</p>
        {event.location && <p className="text-sm text-sec">{event.location}</p>}
      </div>

      {event.description && (
        <div className="text-sm whitespace-pre-wrap text-ink">{event.description}</div>
      )}

      {series && (
        <div className="rounded-lg border border-sep p-4">
          <p className="text-sm font-medium text-ink">{describeSeries(shapeOf(series))}</p>
          {alsoOn.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {alsoOn.map((other) => (
                <li key={other.slug} className="text-sm">
                  <Link href={`/events/${other.slug}`} className="text-accent hover:underline">
                    {eventWhen(other)}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-sec">No other dates are up yet.</p>
          )}
        </div>
      )}

      <EventSignup
        slug={event.slug}
        state={state}
        maxGuests={event.maxGuests}
        message={registrationMessage(state, left)}
        mine={
          mine && mine.status !== "CANCELLED"
            ? { id: mine.id, status: mine.status, guests: mine.guests, name: mine.name }
            : null
        }
        defaults={user ? { name: getDisplayName(user), email: user.email } : null}
        t={t.events}
      />
    </div>
  );
}
