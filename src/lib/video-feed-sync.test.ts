import { describe, expect, it } from "vitest";
import { mayOverwrite, mergeImported } from "./video-feed-sync";
import { bestThumbnail, fingerprintFeed, parseIsoDuration, sourceOf } from "./video-feeds";

/**
 * The one rule this whole feature turns on: a sync must never undo an edit
 * made in the app.
 *
 * A church imports a stream called "Sunday Service 12/10/25 || FULL SERVICE",
 * renames it to "The Cost of Discipleship", files it and adds the scripture
 * references. If tonight's sync writes YouTube's title back, all of that is
 * gone and nobody knows why.
 */

describe("mayOverwrite", () => {
  it("overwrites a field nobody has touched", () => {
    expect(mayOverwrite("Sunday Service", "Sunday Service")).toBe(true);
  });

  it("leaves a field somebody rewrote alone", () => {
    expect(mayOverwrite("The Cost of Discipleship", "Sunday Service")).toBe(false);
  });

  it("treats an emptied field as an edit, not as an invitation", () => {
    expect(mayOverwrite(null, "Sunday Service")).toBe(false);
    expect(mayOverwrite("", "Sunday Service")).toBe(false);
  });

  it("leaves a row alone when there is no record of what was imported", () => {
    // "We don't know whether anybody edited it" must not resolve to
    // "overwrite" — that is a hand-made row, or one from before this existed.
    expect(mayOverwrite("Anything", null)).toBe(false);
  });

  it("counts a null live field against an empty imported one as untouched", () => {
    expect(mayOverwrite(null, "")).toBe(true);
  });
});

describe("mergeImported", () => {
  const incoming = {
    externalId: "abc",
    title: "Sunday Service 19/10/25",
    description: "New description",
    thumbnailUrl: null,
    publishedAt: null,
    durationSeconds: null,
  };

  it("takes the new wording when nothing was edited here", () => {
    const merged = mergeImported(
      {
        title: "Sunday Service 12/10/25",
        description: "Old description",
        importedTitle: "Sunday Service 12/10/25",
        importedDescription: "Old description",
      },
      incoming,
    );
    expect(merged.title).toBe("Sunday Service 19/10/25");
    expect(merged.description).toBe("New description");
  });

  it("keeps a renamed title while still taking the new description", () => {
    // The fields are decided one at a time: renaming the title is not a
    // reason to stop importing everything else.
    const merged = mergeImported(
      {
        title: "The Cost of Discipleship",
        description: "Old description",
        importedTitle: "Sunday Service 12/10/25",
        importedDescription: "Old description",
      },
      incoming,
    );
    expect("title" in merged).toBe(false);
    expect(merged.description).toBe("New description");
  });

  it("always brings the record of what the source says up to date", () => {
    // Or an edit made today looks like an edit for ever, and the field is
    // never importable again.
    const merged = mergeImported(
      {
        title: "The Cost of Discipleship",
        description: "Mine too",
        importedTitle: "Sunday Service 12/10/25",
        importedDescription: "Old description",
      },
      incoming,
    );
    expect(merged.importedTitle).toBe("Sunday Service 19/10/25");
    expect(merged.importedDescription).toBe("New description");
  });
});

describe("parseIsoDuration", () => {
  it("reads what YouTube reports", () => {
    expect(parseIsoDuration("PT1H2M10S")).toBe(3730);
    expect(parseIsoDuration("PT45M")).toBe(2700);
    expect(parseIsoDuration("PT30S")).toBe(30);
    expect(parseIsoDuration("P1DT2H")).toBe(93600);
  });

  it("gives null rather than zero for something it can't read", () => {
    // Zero would render as "0:00" on a card, which reads as a broken video.
    expect(parseIsoDuration("PT")).toBe(null);
    expect(parseIsoDuration("nonsense")).toBe(null);
    expect(parseIsoDuration(null)).toBe(null);
    expect(parseIsoDuration(undefined)).toBe(null);
  });
});

describe("bestThumbnail", () => {
  it("takes the widest offered, since a card is bigger than a favicon", () => {
    expect(
      bestThumbnail({
        default: { url: "small.jpg", width: 120 },
        maxres: { url: "big.jpg", width: 1280 },
        medium: { url: "mid.jpg", width: 320 },
      }),
    ).toBe("big.jpg");
  });

  it("copes with no widths and with nothing at all", () => {
    expect(bestThumbnail({ only: { url: "x.jpg" } })).toBe("x.jpg");
    expect(bestThumbnail({})).toBe(null);
    expect(bestThumbnail(undefined)).toBe(null);
  });
});

describe("fingerprintFeed", () => {
  it("is the same for the same payload and different for a changed one", () => {
    const one = [
      { externalId: "a", title: "A", description: "d", thumbnailUrl: null, publishedAt: null, durationSeconds: null },
    ];
    const two = [{ ...one[0], title: "B" }];
    expect(fingerprintFeed(one)).toBe(fingerprintFeed(one));
    expect(fingerprintFeed(one)).not.toBe(fingerprintFeed(two));
  });

  it("notices a video appearing, so a new upload always syncs", () => {
    const one = [
      { externalId: "a", title: "A", description: "", thumbnailUrl: null, publishedAt: null, durationSeconds: null },
    ];
    expect(fingerprintFeed(one)).not.toBe(fingerprintFeed([...one, { ...one[0], externalId: "b" }]));
  });
});

describe("sourceOf", () => {
  it("maps every feed kind to the player it imports into", () => {
    expect(sourceOf("YOUTUBE_CHANNEL")).toBe("YOUTUBE");
    expect(sourceOf("YOUTUBE_PLAYLIST")).toBe("YOUTUBE");
    expect(sourceOf("VIMEO_USER")).toBe("VIMEO");
    expect(sourceOf("VIMEO_SHOWCASE")).toBe("VIMEO");
  });
});
