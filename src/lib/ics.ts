/**
 * iCalendar, for the one button every church website is asked for: **add this
 * to my calendar**.
 *
 * The app knows when everything is — services, the rota, events people have
 * signed up for — and until now the only way to get any of it into a phone was
 * to type it in again. This writes RFC 5545, which is what Google Calendar,
 * Outlook, Apple Calendar and every phone reads.
 *
 * Written rather than pulled from a library because the whole of what is needed
 * is here: fold, escape, and the two shapes a date takes. The parts that are
 * easy to get subtly wrong — and that a calendar silently mangles rather than
 * rejecting — are the ones with the most said about them below.
 */

export type IcsEvent = {
  /**
   * Stable and globally unique. Stable matters more than unique: a feed
   * re-fetched tomorrow must say "this is the same meeting, moved" rather than
   * "here is a new meeting", or a phone accumulates a duplicate a day.
   */
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  /** When it starts. For an all-day event only the calendar day is used. */
  start: Date;
  /** When it ends. Null means the calendar decides (usually an hour). */
  end?: Date | null;
  allDay?: boolean;
  /** Last time anything about it changed, so a calendar can tell a real edit from a re-fetch. */
  updatedAt?: Date | null;
  /** Shown struck through rather than removed, which is what a cancellation should look like. */
  cancelled?: boolean;
  /** Groups the dates of one repeating thing, so a calendar can show them as related. */
  relatedTo?: string | null;
};

export type IcsCalendar = {
  /** What the calendar is called once subscribed — not standard, but universally honoured. */
  name: string;
  events: readonly IcsEvent[];
  /** Suggested refresh interval for a subscribed feed. */
  refreshHours?: number;
  now?: Date;
};

/**
 * The product id every event is stamped with. Fixed, not versioned: some
 * clients key their "has this calendar changed" heuristics off it.
 */
const PRODID = "-//Marine Team//Church Diary//EN";

/**
 * Escapes the four characters that mean something to the format.
 *
 * `:` is deliberately not among them. It separates a property from its value,
 * so escaping it would be the obvious thing to do — and would break every URL
 * in a description, because the RFC's own text says only backslash, semicolon,
 * comma and newline are escaped in a TEXT value.
 */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Folds a line to 75 octets, continuation lines beginning with a space.
 *
 * Octets, not characters, and that distinction is the whole reason this isn't
 * a one-liner: a line is measured in bytes, but splitting between the bytes of
 * one UTF-8 character produces mojibake that a calendar shows rather than
 * rejects — a description with an em dash in it comes out as a black diamond
 * halfway through a word.
 */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let cursor = 0;
  // 75 for the first line; 74 thereafter, because the leading space counts.
  let limit = 75;
  while (cursor < bytes.length) {
    let take = Math.min(limit, bytes.length - cursor);
    // Never cut inside a UTF-8 sequence: continuation bytes are 10xxxxxx, so
    // step back until the next byte starts a character.
    while (take > 0 && cursor + take < bytes.length && (bytes[cursor + take] & 0b1100_0000) === 0b1000_0000) {
      take -= 1;
    }
    parts.push(bytes.subarray(cursor, cursor + take).toString("utf8"));
    cursor += take;
    limit = 74;
  }
  return parts.join("\r\n ");
}

/** `20260106T193000Z` — an instant, always in UTC. */
export function utcStamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

/** `20260106` — a calendar day, from the date's UTC fields. */
export function dayStamp(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function property(name: string, value: string): string {
  return foldLine(`${name}:${escapeText(value)}`);
}

function eventLines(event: IcsEvent, now: Date): string[] {
  const lines = ["BEGIN:VEVENT", `UID:${event.uid}`, `DTSTAMP:${utcStamp(now)}`];

  if (event.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${dayStamp(event.start)}`);
    // DTEND is *exclusive* for an all-day event: a one-day event ends on the
    // following day. Writing the same day instead is the classic bug that
    // makes every all-day event vanish from month view in some clients.
    const end = event.end ?? new Date(event.start.getTime() + 86_400_000);
    lines.push(`DTEND;VALUE=DATE:${dayStamp(end)}`);
  } else {
    lines.push(`DTSTART:${utcStamp(event.start)}`);
    if (event.end) lines.push(`DTEND:${utcStamp(event.end)}`);
  }

  lines.push(property("SUMMARY", event.title));
  if (event.description) lines.push(property("DESCRIPTION", event.description));
  if (event.location) lines.push(property("LOCATION", event.location));
  // URL is a URI, not TEXT: escaping it would put backslashes into the link.
  if (event.url) lines.push(foldLine(`URL:${event.url}`));
  if (event.relatedTo) lines.push(`RELATED-TO:${event.relatedTo}`);
  if (event.updatedAt) lines.push(`LAST-MODIFIED:${utcStamp(event.updatedAt)}`);
  lines.push(`STATUS:${event.cancelled ? "CANCELLED" : "CONFIRMED"}`);
  lines.push("END:VEVENT");
  return lines;
}

/**
 * The whole calendar, CRLF-terminated as the format requires.
 *
 * Repeating events are written out as one VEVENT per date rather than as a
 * single VEVENT with an RRULE. That matches how they are actually stored — each
 * date is a real event with its own place count and its own page — and it means
 * a cancelled week is simply absent, with no EXDATE bookkeeping to keep in step
 * with the exclusion list. The cost is a longer file, which is text.
 */
export function icsCalendar(calendar: IcsCalendar): string {
  const now = calendar.now ?? new Date();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    property("X-WR-CALNAME", calendar.name),
    ...(calendar.refreshHours
      ? [`REFRESH-INTERVAL;VALUE=DURATION:PT${calendar.refreshHours}H`, `X-PUBLISHED-TTL:PT${calendar.refreshHours}H`]
      : []),
    ...calendar.events.flatMap((event) => eventLines(event, now)),
    "END:VCALENDAR",
  ];
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * A filename a browser will save sensibly, from a calendar's name.
 *
 * Anything that isn't a letter, digit or dash is dropped rather than escaped:
 * this ends up inside a quoted `Content-Disposition` header, and a quote or a
 * newline that survived into it is a header-injection bug rather than an
 * untidy filename.
 */
export function icsFilename(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "calendar"}.ics`;
}
