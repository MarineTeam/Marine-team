import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { parseBunnyResolutions, selectMp4Height, bunnyStreamMp4Url, downloadHeight, probeBunnyMp4 } = await import(
  "./bunny"
);

describe("parseBunnyResolutions", () => {
  it("returns nothing for an empty or missing string", () => {
    expect(parseBunnyResolutions(null)).toEqual([]);
    expect(parseBunnyResolutions(undefined)).toEqual([]);
    expect(parseBunnyResolutions("")).toEqual([]);
  });

  it("parses a comma list, highest first, regardless of Bunny's order", () => {
    expect(parseBunnyResolutions("240p,360p,480p")).toEqual([480, 360, 240]);
    expect(parseBunnyResolutions("720p,360p,1080p")).toEqual([1080, 720, 360]);
  });

  it("drops resolutions we don't have an MP4 constant for", () => {
    expect(parseBunnyResolutions("144p,240p,4320p")).toEqual([240]);
  });

  it("de-duplicates", () => {
    expect(parseBunnyResolutions("720p,720p,480p")).toEqual([720, 480]);
  });
});

describe("selectMp4Height", () => {
  const originalEnv = process.env.BUNNY_STREAM_DOWNLOAD_HEIGHT;
  afterEach(() => {
    process.env.BUNNY_STREAM_DOWNLOAD_HEIGHT = originalEnv;
  });

  it("picks the highest available at or under the default 720p cap", () => {
    delete process.env.BUNNY_STREAM_DOWNLOAD_HEIGHT;
    expect(selectMp4Height("360p,480p,720p,1080p")).toBe(720);
  });

  it("steps down when the cap isn't available — the 480p-only case", () => {
    delete process.env.BUNNY_STREAM_DOWNLOAD_HEIGHT;
    expect(selectMp4Height("240p,360p,480p")).toBe(480);
  });

  it("respects a configured maximum lower than what's available", () => {
    process.env.BUNNY_STREAM_DOWNLOAD_HEIGHT = "480";
    expect(selectMp4Height("360p,480p,720p,1080p")).toBe(480);
  });

  it("returns null when nothing available is at or under the cap", () => {
    process.env.BUNNY_STREAM_DOWNLOAD_HEIGHT = "240";
    expect(selectMp4Height("480p,720p")).toBeNull();
  });

  it("returns null when there's nothing to choose from", () => {
    expect(selectMp4Height(null)).toBeNull();
    expect(selectMp4Height("")).toBeNull();
  });
});

describe("downloadHeight", () => {
  const originalEnv = process.env.BUNNY_STREAM_DOWNLOAD_HEIGHT;
  afterEach(() => {
    process.env.BUNNY_STREAM_DOWNLOAD_HEIGHT = originalEnv;
  });

  it("defaults to 720 when unset or invalid", () => {
    delete process.env.BUNNY_STREAM_DOWNLOAD_HEIGHT;
    expect(downloadHeight()).toBe(720);
    process.env.BUNNY_STREAM_DOWNLOAD_HEIGHT = "999";
    expect(downloadHeight()).toBe(720);
  });

  it("honors a valid configured height", () => {
    process.env.BUNNY_STREAM_DOWNLOAD_HEIGHT = "1080";
    expect(downloadHeight()).toBe(1080);
  });
});

describe("bunnyStreamMp4Url", () => {
  const originalHostname = process.env.BUNNY_STREAM_CDN_HOSTNAME;
  const originalKey = process.env.BUNNY_STREAM_TOKEN_AUTH_KEY;
  afterEach(() => {
    process.env.BUNNY_STREAM_CDN_HOSTNAME = originalHostname;
    process.env.BUNNY_STREAM_TOKEN_AUTH_KEY = originalKey;
  });

  it("builds the correct Bunny MP4 fallback path for the selected height", () => {
    process.env.BUNNY_STREAM_CDN_HOSTNAME = "cdn.example.com";
    delete process.env.BUNNY_STREAM_TOKEN_AUTH_KEY;
    const url = bunnyStreamMp4Url("video-123", 480);
    expect(url).toBe("https://cdn.example.com/video-123/play_480p.mp4");
  });

  it("never defaults to 720p — height is required", () => {
    process.env.BUNNY_STREAM_CDN_HOSTNAME = "cdn.example.com";
    const url = bunnyStreamMp4Url("video-123", 360);
    expect(url).toContain("play_360p.mp4");
    expect(url).not.toContain("play_720p.mp4");
  });

  it("throws rather than returning a broken URL when the hostname isn't configured", () => {
    delete process.env.BUNNY_STREAM_CDN_HOSTNAME;
    expect(() => bunnyStreamMp4Url("video-123", 720)).toThrow();
  });
});

describe("probeBunnyMp4", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("classifies 403/401 as forbidden, not missing", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 403 });
    expect(await probeBunnyMp4("https://cdn.example.com/x/play_720p.mp4")).toBe("forbidden");
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 401 });
    expect(await probeBunnyMp4("https://cdn.example.com/x/play_720p.mp4")).toBe("forbidden");
  });

  it("classifies 404/410 as missing", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 404 });
    expect(await probeBunnyMp4("https://cdn.example.com/x/play_720p.mp4")).toBe("missing");
  });

  it("classifies a 200/206 as ok", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 206 });
    expect(await probeBunnyMp4("https://cdn.example.com/x/play_720p.mp4")).toBe("ok");
  });

  it("classifies a network failure or 5xx as a generic error, not missing", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));
    expect(await probeBunnyMp4("https://cdn.example.com/x/play_720p.mp4")).toBe("error");
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 503 });
    expect(await probeBunnyMp4("https://cdn.example.com/x/play_720p.mp4")).toBe("error");
  });

  it("treats an empty URL as an error rather than fetching", async () => {
    expect(await probeBunnyMp4("")).toBe("error");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
