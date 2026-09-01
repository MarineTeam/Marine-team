import { describe, expect, it } from "vitest";
import { feedDate, feedDuration, isFeedable, mrssFeed, rokuFeed, type FeedVideo } from "./tv-feed";

/**
 * A feed is fetched by somebody else's server, with no session, and is then
 * cached and republished by them. There is no way to put a login in front of
 * the thing Roku's crawler reads, so everything in here is public by
 * construction - which is enforced by the query, and asserted where the
 * query's shape is the whole safety argument.
 */

const video = (over: Partial<FeedVideo> = {}): FeedVideo => ({
  id: "v1",
  slug: "the-cost-of-discipleship",
  title: "The Cost of Discipleship",
  description: "Luke 14.",
  durationSeconds: 2400,
  source: "BUNNY",
  externalId: null,
  externalUrl: null,
  createdAt: new Date("2026-10-12T10:00:00Z"),
  publishAt: null,
  language: "en",
  thumbnailUrl: "https://cdn.example/thumb.jpg",
  seriesTitle: "Luke",
  speakerName: "Ruth Adeyemi",
  ...over,
});

const options = { providerName: "Marine Team", baseUrl: "https://example.org", language: "en" };

describe("isFeedable", () => {
  it("takes an ordinary video", () => {
    expect(isFeedable(video())).toBe(true);
  });

  it("leaves out one with no duration rather than having the feed rejected", () => {
    // Roku's validator refuses an item without a duration, and refuses the
    // whole feed with it. One missing field must not take the channel down.
    expect(isFeedable(video({ durationSeconds: null }))).toBe(false);
    expect(isFeedable(video({ durationSeconds: 0 }))).toBe(false);
  });

  it("leaves out an imported video with nowhere to play it", () => {
    expect(isFeedable(video({ source: "YOUTUBE", externalUrl: null }))).toBe(false);
    expect(isFeedable(video({ source: "YOUTUBE", externalUrl: "https://youtu.be/x" }))).toBe(true);
  });
});

describe("feedDuration", () => {
  it("is a whole number of seconds", () => {
    expect(feedDuration(2400.6)).toBe(2401);
    expect(feedDuration(null)).toBe(0);
    expect(feedDuration(-5)).toBe(0);
  });
});

describe("feedDate", () => {
  it("prefers the publish date to when the row happened to be made", () => {
    expect(feedDate(video({ publishAt: new Date("2026-10-11T00:00:00Z") }))).toBe("2026-10-11");
    expect(feedDate(video())).toBe("2026-10-12");
  });
});

describe("rokuFeed", () => {
  it("describes each video the way Direct Publisher expects", () => {
    const feed = rokuFeed([video()], options);
    expect(feed.shortFormVideos).toHaveLength(1);
    const item = feed.shortFormVideos[0];
    expect(item.id).toBe("v1");
    expect(item.content.duration).toBe(2400);
    expect(item.content.videos[0].url).toBe("https://example.org/videos/the-cost-of-discipleship");
    expect(item.thumbnail).toBe("https://cdn.example/thumb.jpg");
  });

  it("points at the source's own URL for an imported video", () => {
    const feed = rokuFeed([video({ source: "YOUTUBE", externalUrl: "https://youtu.be/abc" })], options);
    expect(feed.shortFormVideos[0].content.videos[0].url).toBe("https://youtu.be/abc");
  });

  it("never sends an empty description, which fails their validation", () => {
    const feed = rokuFeed([video({ description: null })], options);
    expect(feed.shortFormVideos[0].shortDescription).toBe("The Cost of Discipleship");
    const blank = rokuFeed([video({ description: "   " })], options);
    expect(blank.shortFormVideos[0].shortDescription).toBe("The Cost of Discipleship");
  });

  it("trims to their limits rather than being truncated mid-word by them", () => {
    const feed = rokuFeed([video({ title: "t".repeat(300), description: "d".repeat(400) })], options);
    expect(feed.shortFormVideos[0].title.length).toBe(100);
    expect(feed.shortFormVideos[0].shortDescription.length).toBe(200);
  });

  it("carries the series and the speaker as tags, and drops the ones missing", () => {
    expect(rokuFeed([video()], options).shortFormVideos[0].tags).toEqual(["Luke", "Ruth Adeyemi"]);
    expect(
      rokuFeed([video({ seriesTitle: null, speakerName: null })], options).shortFormVideos[0].tags,
    ).toEqual([]);
  });

  it("silently leaves out what it cannot describe", () => {
    const feed = rokuFeed([video(), video({ id: "v2", durationSeconds: null })], options);
    expect(feed.shortFormVideos.map((item) => item.id)).toEqual(["v1"]);
  });
});

describe("mrssFeed", () => {
  it("is the same catalogue in the other shape", () => {
    const xml = mrssFeed([video()], options);
    expect(xml).toContain("<title>The Cost of Discipleship</title>");
    expect(xml).toContain('duration="2400"');
    expect(xml).toContain('url="https://cdn.example/thumb.jpg"');
  });

  it("escapes what a title can legally contain", () => {
    // An admin types these. Unescaped, one apostrophe breaks the feed for
    // every platform reading it.
    const xml = mrssFeed([video({ title: "Bread & Wine <live>" })], options);
    expect(xml).toContain("Bread &amp; Wine &lt;live&gt;");
    expect(xml).not.toContain("<live>");
  });

  it("leaves out exactly what the JSON leaves out", () => {
    // Two feeds of the same library disagreeing about what exists is the
    // failure nobody notices until a viewer reports a missing sermon.
    const list = [video(), video({ id: "v2", durationSeconds: null })];
    const xml = mrssFeed(list, options);
    expect(xml.match(/<item>/g) ?? []).toHaveLength(rokuFeed(list, options).shortFormVideos.length);
  });
});
