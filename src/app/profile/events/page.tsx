import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { eventWhen, listRegistrationsFor } from "@/lib/events";
import { currentMessages } from "@/lib/i18n/locale";
import { isPluginEnabled } from "@/lib/plugins";

export const metadata = { title: "Your events" };
export const dynamic = "force-dynamic";

/**
 * What this member has signed up for.
 *
 * In the profile rather than under /events because it is *theirs*: the events
 * page is what's on, and this is the two or three things they said yes to and
 * would like to be reminded of.
 */
export default async function ProfileEventsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?returnTo=/profile/events");

  if (!(await isPluginEnabled("events"))) {
    return <p className="text-sm text-sec">Events are switched off at the moment.</p>;
  }

  const { t } = await currentMessages();
  const registrations = await listRegistrationsFor(user.id);
  const upcoming = registrations.filter(
    (registration) => (registration.event.endsAt ?? registration.event.startsAt) >= new Date(),
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">{t.events.yourEvents}</h2>
        <p className="mt-1 text-sm text-sec">{t.events.yourEventsSubtitle}</p>
      </div>

      {upcoming.length === 0 ? (
        <p className="rounded-lg border border-dashed border-sep p-8 text-center text-sm text-sec">
          {t.events.notSignedUp}{" "}
          <Link href="/events" className="text-accent hover:underline">
            {t.events.seeWhatsOn} →
          </Link>
        </p>
      ) : (
        <ul className="divide-y divide-sep rounded-lg border border-sep">
          {upcoming.map((registration) => (
            <li key={registration.id}>
              <Link
                href={`/events/${registration.event.slug}`}
                className="block px-4 py-3 hover:bg-hover"
              >
                <span className="block text-sm font-medium text-ink">{registration.event.title}</span>
                <span className="block text-xs text-sec">
                  {eventWhen(registration.event)}
                  {registration.guests > 0 && ` · bringing ${registration.guests}`}
                </span>
                {registration.status === "WAITLIST" && (
                  <span className="mt-0.5 block text-xs text-ter">{t.events.youreWaiting}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
