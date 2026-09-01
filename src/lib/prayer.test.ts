import { describe, expect, it } from "vitest";
import {
  ANONYMOUS_LABEL,
  bylineFor,
  canDelete,
  canPrayFor,
  canSee,
  presentPrayer,
  visibleTo,
  type PrayerRow,
  type Viewer,
} from "./prayer";

/**
 * A prayer wall is a moderation problem wearing a list, and the two ways it
 * goes badly wrong are letting somebody read what wasn't for them and putting
 * a name on something somebody asked to be anonymous. Both are decided here,
 * so both are pinned here.
 */

const row = (over: Partial<PrayerRow> = {}): PrayerRow => ({
  id: "p1",
  userId: "writer",
  name: "Cindy",
  body: "For my mum, who is in hospital.",
  anonymous: false,
  visibility: "MEMBERS",
  status: "APPROVED",
  answeredNote: null,
  answeredAt: null,
  createdAt: new Date("2026-09-01T00:00:00Z"),
  ...over,
});

const visitor: Viewer = { userId: null, moderates: false };
const member: Viewer = { userId: "someone", moderates: false };
const writer: Viewer = { userId: "writer", moderates: false };
const moderator: Viewer = { userId: "pastor", moderates: true };

describe("canSee", () => {
  it("shows nothing to anybody until it has been let through", () => {
    const waiting = row({ status: "PENDING" });
    expect(canSee(waiting, visitor)).toBe(false);
    expect(canSee(waiting, member)).toBe(false);
  });

  it("still shows a waiting request to whoever wrote it", () => {
    // Otherwise writing one and waiting looks exactly like it being binned.
    expect(canSee(row({ status: "PENDING" }), writer)).toBe(true);
  });

  it("shows the queue to a moderator, which is the job", () => {
    expect(canSee(row({ status: "PENDING" }), moderator)).toBe(true);
    expect(canSee(row({ status: "HIDDEN" }), moderator)).toBe(true);
  });

  it("keeps a taken-down request away from everybody else", () => {
    expect(canSee(row({ status: "HIDDEN" }), member)).toBe(false);
    expect(canSee(row({ status: "HIDDEN" }), visitor)).toBe(false);
  });

  it("honours the three audiences", () => {
    expect(canSee(row({ visibility: "EVERYONE" }), visitor)).toBe(true);
    expect(canSee(row({ visibility: "MEMBERS" }), visitor)).toBe(false);
    expect(canSee(row({ visibility: "MEMBERS" }), member)).toBe(true);
    expect(canSee(row({ visibility: "LEADERS" }), member)).toBe(false);
    expect(canSee(row({ visibility: "LEADERS" }), moderator)).toBe(true);
  });

  it("shows an answered request wherever an approved one would show", () => {
    expect(canSee(row({ status: "ANSWERED", visibility: "EVERYONE" }), visitor)).toBe(true);
  });

  it("doesn't hand a visitor somebody else's request because both have no account", () => {
    // A null userId matching a null userId would be the nastiest bug here.
    expect(canSee(row({ userId: null, status: "PENDING" }), visitor)).toBe(false);
  });
});

describe("bylineFor", () => {
  it("gives the name when there is one to give", () => {
    expect(bylineFor({ anonymous: false, name: "Cindy" })).toBe("Cindy");
  });

  it("never gives a name for an anonymous request", () => {
    expect(bylineFor({ anonymous: true, name: "Cindy" })).toBe(ANONYMOUS_LABEL);
  });

  it("doesn't leak a blank as a name", () => {
    expect(bylineFor({ anonymous: false, name: "   " })).toBe(ANONYMOUS_LABEL);
    expect(bylineFor({ anonymous: false, name: null })).toBe(ANONYMOUS_LABEL);
  });
});

describe("presentPrayer", () => {
  it("carries no account id out, for anyone", () => {
    for (const viewer of [visitor, member, writer, moderator]) {
      const shown = presentPrayer(row({ anonymous: true }), viewer, { prayers: 2, prayed: false });
      expect(JSON.stringify(shown)).not.toContain("writer");
      expect(shown.by).toBe(ANONYMOUS_LABEL);
    }
  });

  it("withholds the name even from the moderator's own list", () => {
    // A screenshot of that list is how an anonymous request stops being one.
    expect(presentPrayer(row({ anonymous: true }), moderator, { prayers: 0, prayed: false }).by).toBe(
      ANONYMOUS_LABEL,
    );
  });

  it("says whose it is to act on", () => {
    const counts = { prayers: 0, prayed: false };
    expect(presentPrayer(row(), writer, counts).mine).toBe(true);
    expect(presentPrayer(row(), member, counts).mine).toBe(false);
    expect(presentPrayer(row(), moderator, counts).mine).toBe(true);
  });
});

describe("visibleTo", () => {
  const wall = [
    { ...row({ id: "a", status: "APPROVED" }), prayers: [{ userId: "someone" }] },
    { ...row({ id: "b", status: "PENDING" }), prayers: [] },
    { ...row({ id: "c", status: "HIDDEN" }), prayers: [] },
    { ...row({ id: "d", visibility: "LEADERS" as const }), prayers: [] },
  ];

  it("drops what a member may not see, without them knowing it was there", () => {
    expect(visibleTo(wall, member).map((item) => item.id)).toEqual(["a"]);
  });

  it("counts prayers and knows whether this reader is one of them", () => {
    const [first] = visibleTo(wall, member);
    expect(first.prayers).toBe(1);
    expect(first.prayed).toBe(true);
    expect(visibleTo(wall, { userId: "other", moderates: false })[0].prayed).toBe(false);
  });

  it("gives a moderator the lot", () => {
    expect(visibleTo(wall, moderator)).toHaveLength(4);
  });
});

describe("canPrayFor", () => {
  it("needs an account, because pressing it twice mustn't be two", () => {
    expect(canPrayFor(row(), visitor)).toBe(false);
    expect(canPrayFor(row(), member)).toBe(true);
  });

  it("won't count a prayer for something nobody has been shown", () => {
    // A moderator can see the queue; praying into it would make the number
    // mean something other than what it says.
    expect(canPrayFor(row({ status: "PENDING" }), moderator)).toBe(false);
  });
});

describe("canDelete", () => {
  it("is the writer's, and the moderator's", () => {
    expect(canDelete(row(), writer)).toBe(true);
    expect(canDelete(row(), moderator)).toBe(true);
    expect(canDelete(row(), member)).toBe(false);
    expect(canDelete(row({ userId: null }), visitor)).toBe(false);
  });
});
