import { toIsoDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import type {
  ProviderValidation,
  ScheduleProvider,
  SourceFetchResult,
} from "@/lib/schedules/types";

/**
 * Reads a web-managed schedule -- one whose events are created in the admin UI
 * -- through the same interface as the Google Sheets provider.
 *
 * For this source the database *is* the system of record, so "syncing" is a
 * no-op: the events are already where they need to be. The provider still
 * exists because it lets every caller treat all schedules identically. A
 * schedule can be switched from Google Sheets to web-managed and the calling
 * code does not change.
 */
export class DatabaseScheduleProvider implements ScheduleProvider {
  readonly type = "WEB" as const;
  readonly label = "Web managed";

  constructor(private readonly scheduleId: string) {}

  isAvailable(): boolean {
    return true;
  }

  async fetchEvents(): Promise<SourceFetchResult> {
    const events = await prisma.calendarEvent.findMany({
      where: { scheduleId: this.scheduleId, deletedAt: null },
      include: { people: { include: { person: true } } },
      orderBy: { date: "asc" },
    });

    const discovered = new Map<string, string>();
    for (const event of events) {
      for (const link of event.people) {
        discovered.set(link.person.normalizedName, link.person.displayName);
      }
    }

    return {
      events: events.map((event) => ({
        externalId: event.externalId ?? event.id,
        date: toIsoDate(event.date),
        endDate: event.endDate ? toIsoDate(event.endDate) : null,
        allDay: event.allDay,
        startTime: event.startTime,
        endTime: event.endTime,
        title: event.title,
        notes: event.notes,
        location: event.location,
        status: event.status,
        peopleNames: event.people.map((link) => link.person.displayName),
        roles: Object.fromEntries(
          event.people
            .filter((link) => link.role)
            .map((link) => [link.person.displayName, link.role as string]),
        ),
        sourceRow: event.sourceRow,
      })),
      issues: [],
      discoveredNames: [...discovered.values()].sort((a, b) => a.localeCompare(b)),
      // The database is authoritative, so there is nothing to compare against.
      fingerprint: `db:${this.scheduleId}`,
    };
  }

  async validate(): Promise<ProviderValidation> {
    const count = await prisma.calendarEvent.count({
      where: { scheduleId: this.scheduleId, deletedAt: null },
    });
    return {
      ok: true,
      message: `Web-managed schedule with ${count} event${count === 1 ? "" : "s"}.`,
    };
  }
}
