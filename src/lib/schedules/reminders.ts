import { prisma } from "@/lib/db";
import { addIsoDays, formatIsoDate, fromIsoDate, todayIso } from "@/lib/dates";
import { notifySubscribers } from "@/lib/push";

/**
 * "You're on tomorrow."
 *
 * The calendar app sent these to anonymous per-device push subscriptions,
 * because its whole premise is people without accounts. This app already has
 * push, and it is keyed to an account — so rather than stand up a second push
 * stack beside it, a reminder goes to the member whose account is linked to
 * that name (see Person.userId).
 *
 * The consequence is worth stating plainly: **somebody on a rota with no
 * account gets no reminder.** They still see the calendar, which is the
 * source of truth; the reminder is a convenience for those the app can
 * already reach. Linking their name to their account in the admin is what
 * turns it on for them.
 *
 * One notification per person per day, however many things they are on for:
 * three separate buzzes about the same morning is how somebody turns
 * notifications off.
 */
export async function sendScheduleReminders(now: Date = new Date()) {
  const tomorrow = addIsoDays(todayIso(undefined, now), 1);

  const events = await prisma.calendarEvent.findMany({
    where: {
      deletedAt: null,
      status: { not: "CANCELLED" },
      date: fromIsoDate(tomorrow),
      schedule: { is: { enabled: true, deletedAt: null } },
    },
    select: {
      schedule: { select: { name: true } },
      people: {
        select: {
          role: true,
          person: { select: { displayName: true, userId: true } },
        },
      },
    },
  });

  // Gathered per member first, so somebody on two rotas gets one message
  // naming both rather than two messages.
  const duties = new Map<string, string[]>();
  for (const event of events) {
    for (const participant of event.people) {
      const userId = participant.person.userId;
      if (!userId) continue;
      const what = participant.role?.trim()
        ? `${event.schedule.name} (${participant.role.trim()})`
        : event.schedule.name;
      const existing = duties.get(userId);
      if (existing) existing.push(what);
      else duties.set(userId, [what]);
    }
  }

  const day = formatIsoDate(tomorrow);
  for (const [userId, what] of duties) {
    await notifySubscribers(
      {
        title: `You're on tomorrow — ${day}`,
        body: what.join(" · "),
        url: "/calendar",
      },
      [userId],
    );
  }

  return { date: tomorrow, notified: duties.size, events: events.length };
}
