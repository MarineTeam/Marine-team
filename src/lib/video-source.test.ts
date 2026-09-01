import { describe, expect, it } from "vitest";
import { isBunnyVideo, sourceName, videoEmbedUrl, videoThumbnailUrl, watchAtSourceUrl } from "./video-source";

const external = (source: "YOUTUBE" | "VIMEO", externalId: string) => ({
  source,
  bunnyVideoId: null,
  externalId,
  externalThumbnailUrl: "https://img.example/thumb.jpg",
  thumbnailFileName: null,
});

describe("videoEmbedUrl", () => {
  it("uses YouTube's no-cookie player and turns off related videos", () => {
    // A sermon on a church's own site should not end in a wall of somebody
    // else's recommendations.
    const url = videoEmbedUrl(external("YOUTUBE", "abc123"));
    expect(url.startsWith("https://www.youtube-nocookie.com/embed/abc123?")).toBe(true);
    expect(url).toContain("rel=0");
  });

  it("carries a start time into each player's own way of taking one", () => {
    expect(videoEmbedUrl(external("YOUTUBE", "abc"), 90)).toContain("start=90");
    // Vimeo wants it as a fragment, not a parameter.
    expect(videoEmbedUrl(external("VIMEO", "555"), 90)).toContain("#t=90s");
  });

  it("leaves the start off entirely at zero rather than sending start=0", () => {
    expect(videoEmbedUrl(external("YOUTUBE", "abc"), 0)).not.toContain("start=");
    expect(videoEmbedUrl(external("VIMEO", "555"))).not.toContain("#t=");
  });

  it("asks Vimeo not to track", () => {
    expect(videoEmbedUrl(external("VIMEO", "555"))).toContain("dnt=1");
  });

  it("escapes an id rather than pasting it into a URL", () => {
    expect(videoEmbedUrl(external("YOUTUBE", "a/b?c"))).toContain("a%2Fb%3Fc");
  });

  it("gives nothing for a source with no id, rather than a broken frame", () => {
    expect(videoEmbedUrl({ ...external("YOUTUBE", ""), externalId: null })).toBe("");
    expect(
      videoEmbedUrl({ source: "BUNNY", bunnyVideoId: null, externalId: null, externalThumbnailUrl: null, thumbnailFileName: null }),
    ).toBe("");
  });
});

describe("videoThumbnailUrl", () => {
  it("uses the one the source gave us", () => {
    expect(videoThumbnailUrl(external("YOUTUBE", "abc"))).toBe("https://img.example/thumb.jpg");
  });

  it("returns an empty string rather than a broken image", () => {
    expect(videoThumbnailUrl({ ...external("VIMEO", "1"), externalThumbnailUrl: null })).toBe("");
  });
});

describe("videoThumbnailUrl, for a video stored here", () => {
  it("asks Bunny rather than calling itself", () => {
    // A bulk rewrite once turned this into a call to itself, which every
    // Bunny thumbnail on the site would have hit as a stack overflow — and
    // which type-checked, linted and built perfectly.
    const url = videoThumbnailUrl({
      source: "BUNNY",
      bunnyVideoId: "guid-1",
      externalId: null,
      externalThumbnailUrl: null,
      thumbnailFileName: "custom.jpg",
    });
    // With no BUNNY_STREAM_CDN_HOSTNAME set it is empty; what matters is that
    // it returned at all rather than recursing.
    expect(typeof url).toBe("string");
  });
});

describe("isBunnyVideo", () => {
  it("is what gates the Bunny-only features", () => {
    expect(isBunnyVideo({ source: "BUNNY", bunnyVideoId: "x" })).toBe(true);
    expect(isBunnyVideo({ source: "YOUTUBE", bunnyVideoId: null })).toBe(false);
    // A Bunny row with no id is a broken row, not a downloadable video.
    expect(isBunnyVideo({ source: "BUNNY", bunnyVideoId: null })).toBe(false);
  });
});

describe("watchAtSourceUrl", () => {
  it("points at the page a person would land on", () => {
    expect(watchAtSourceUrl({ source: "YOUTUBE", externalId: "abc" })).toBe(
      "https://www.youtube.com/watch?v=abc",
    );
    expect(watchAtSourceUrl({ source: "VIMEO", externalId: "555" })).toBe("https://vimeo.com/555");
  });

  it("has nowhere to send somebody for a video that lives here", () => {
    expect(watchAtSourceUrl({ source: "BUNNY", externalId: null })).toBe(null);
  });
});

describe("sourceName", () => {
  it("names the three", () => {
    expect(sourceName("YOUTUBE")).toBe("YouTube");
    expect(sourceName("VIMEO")).toBe("Vimeo");
    expect(sourceName("BUNNY")).toBe("this site");
  });
});
