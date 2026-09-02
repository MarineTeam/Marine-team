import { describe, it, expect } from "vitest";
import { dayStamp, escapeText, foldLine, icsCalendar, icsFilename, utcStamp } from "./ics";

const NOW = new Date("2026-09-02T09:00:00Z");

const one = {
  uid: "event-1@marine",
  title: "Prayer Meeting",
  start: new Date("2026-01-06T19:30:00Z"),
  end: new Date("2026-01-06T21:00:00Z"),
};

describe("escapeText", () => {
  it("escapes the four characters the format reserves", () => {
    expect(escapeText("a,b;c\\d")).toBe("a\\,b\\;c\\\\d");
    expect(escapeText("line one\nline two")).toBe("line one\\nline two");
    expect(escapeText("carriage\r\nreturn")).toBe("carriage\\nreturn");
  });

  it("leaves a colon alone, so a URL in a description survives", () => {
    // Escaping it would be the obvious thing to do — it separates a property
    // from its value — and would break every link anybody writes.
    expect(escapeText("See https://example.com/x")).toBe("See https://example.com/x");
  });

  it("escapes the backslash first, so an escape isn't escaped twice", () => {
    expect(escapeText("\\,")).toBe("\\\\\\,");
  });
});

describe("foldLine", () => {
  it("leaves a short line alone", () => {
    expect(foldLine("SUMMARY:Prayer Meeting")).toBe("SUMMARY:Prayer Meeting");
  });

  it("folds at 75 octets, continuing with a space", () => {
    const line = `SUMMARY:${"a".repeat(200)}`;
    const parts = foldLine(line).split("\r\n");
    expect(parts[0].length).toBe(75);
    expect(parts.slice(1).every((part) => part.startsWith(" "))).toBe(true);
    // Unfolding gets the original back, which is the only thing that matters.
    expect(parts.map((part, index) => (index === 0 ? part : part.slice(1))).join("")).toBe(line);
  });

  it("never cuts a character in half", () => {
    // Multi-byte characters straddling the 75th octet: a naive slice produces
    // a black diamond halfway through a word, which a calendar shows rather
    // than rejecting.
    const line = `DESCRIPTION:${"—".repeat(60)}`;
    const unfolded = foldLine(line)
      .split("\r\n")
      .map((part, index) => (index === 0 ? part : part.slice(1)))
      .join("");
    expect(unfolded).toBe(line);
    expect(unfolded).not.toContain("�");
    for (const part of foldLine(line).split("\r\n")) {
      expect(Buffer.from(part, "utf8").length).toBeLessThanOrEqual(75);
    }
  });
});

describe("stamps", () => {
  it("writes an instant as UTC with no punctuation", () => {
    expect(utcStamp(new Date("2026-01-06T19:30:00Z"))).toBe("20260106T193000Z");
  });

  it("writes a day as eight digits", () => {
    expect(dayStamp(new Date("2026-01-06T19:30:00Z"))).toBe("20260106");
  });
});

describe("icsCalendar", () => {
  const parse = (text: string) => {
    // An independent unfold-and-read, so these tests check the bytes rather
    // than the code that produced them.
    const unfolded = text.replace(/\r\n[ \t]/g, "");
    return unfolded.split("\r\n").filter(Boolean);
  };

  it("writes a calendar a client will accept", () => {
    const lines = parse(icsCalendar({ name: "What's On", events: [one], now: NOW }));
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain("X-WR-CALNAME:What's On");
    expect(lines).toContain("BEGIN:VEVENT");
    expect(lines).toContain("UID:event-1@marine");
    expect(lines).toContain("DTSTAMP:20260902T090000Z");
    expect(lines).toContain("DTSTART:20260106T193000Z");
    expect(lines).toContain("DTEND:20260106T210000Z");
    expect(lines).toContain("SUMMARY:Prayer Meeting");
    expect(lines).toContain("STATUS:CONFIRMED");
    expect(lines[lines.length - 1]).toBe("END:VCALENDAR");
  });

  it("ends every line with CRLF, which the format requires", () => {
    const text = icsCalendar({ name: "x", events: [one], now: NOW });
    expect(text.endsWith("\r\n")).toBe(true);
    expect(text.split("\n").every((line) => line === "" || line.endsWith("\r"))).toBe(true);
  });

  it("ends an all-day event on the following day, because DTEND is exclusive", () => {
    // Writing the same day is the bug that makes all-day events vanish from
    // month view in some clients.
    const lines = parse(
      icsCalendar({
        name: "x",
        events: [{ uid: "u", title: "Church Picnic", start: new Date("2026-07-04T00:00:00Z"), allDay: true }],
        now: NOW,
      }),
    );
    expect(lines).toContain("DTSTART;VALUE=DATE:20260704");
    expect(lines).toContain("DTEND;VALUE=DATE:20260705");
  });

  it("keeps an explicit all-day finish", () => {
    const lines = parse(
      icsCalendar({
        name: "x",
        events: [
          {
            uid: "u",
            title: "Camp",
            start: new Date("2026-07-04T00:00:00Z"),
            end: new Date("2026-07-08T00:00:00Z"),
            allDay: true,
          },
        ],
        now: NOW,
      }),
    );
    expect(lines).toContain("DTEND;VALUE=DATE:20260708");
  });

  it("leaves the finish out when there isn't one", () => {
    const lines = parse(icsCalendar({ name: "x", events: [{ ...one, end: null }], now: NOW }));
    expect(lines.some((line) => line.startsWith("DTEND"))).toBe(false);
  });

  it("marks a cancellation rather than dropping it", () => {
    const lines = parse(icsCalendar({ name: "x", events: [{ ...one, cancelled: true }], now: NOW }));
    expect(lines).toContain("STATUS:CANCELLED");
  });

  it("writes a URL unescaped", () => {
    const lines = parse(
      icsCalendar({ name: "x", events: [{ ...one, url: "https://example.com/events/a,b" }], now: NOW }),
    );
    expect(lines).toContain("URL:https://example.com/events/a,b");
  });

  it("escapes a description that would otherwise break the file", () => {
    const lines = parse(
      icsCalendar({ name: "x", events: [{ ...one, description: "Bring: tea, cake; and a Bible\nUpstairs" }], now: NOW }),
    );
    expect(lines).toContain("DESCRIPTION:Bring: tea\\, cake\\; and a Bible\\nUpstairs");
  });

  it("offers a refresh interval to anything subscribing", () => {
    const lines = parse(icsCalendar({ name: "x", events: [], refreshHours: 6, now: NOW }));
    expect(lines).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT6H");
    expect(lines).toContain("X-PUBLISHED-TTL:PT6H");
  });

  it("balances BEGIN and END for every event", () => {
    const text = icsCalendar({ name: "x", events: [one, { ...one, uid: "two" }], now: NOW });
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(text.match(/END:VEVENT/g)).toHaveLength(2);
  });
});

describe("icsFilename", () => {
  it("makes a name a browser will save", () => {
    expect(icsFilename("What's On")).toBe("what-s-on.ics");
    expect(icsFilename("Rota — Alice")).toBe("rota-alice.ics");
  });

  it("drops anything that could break the header it sits in", () => {
    // This ends up inside a quoted Content-Disposition; a surviving quote or
    // newline is a header-injection bug, not an untidy filename.
    expect(icsFilename('a"b\nc')).toBe("a-b-c.ics");
    expect(icsFilename("!!!")).toBe("calendar.ics");
  });
});
