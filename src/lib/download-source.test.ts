import { afterEach, describe, expect, it, vi } from "vitest";

const bunnyGetStreamVideo = vi.fn();
const bunnyStreamMp4Url = vi.fn();
const probeBunnyMp4 = vi.fn();
const videoUpdate = vi.fn();

vi.mock("@/lib/db", () => ({ prisma: { video: { update: (...args: unknown[]) => videoUpdate(...args) } } }));

// Real selectMp4Height/parseBunnyResolutions — only the network-touching
// pieces of bunny.ts are mocked, so the resolution-selection tests exercise
// the actual precedence logic rather than a stand-in.
vi.mock("@/lib/bunny", async () => {
  const actual = await vi.importActual<typeof import("./bunny")>("./bunny");
  return {
    ...actual,
    bunnyGetStreamVideo: (...args: unknown[]) => bunnyGetStreamVideo(...args),
    bunnyStreamMp4Url: (...args: unknown[]) => bunnyStreamMp4Url(...args),
    probeBunnyMp4: (...args: unknown[]) => probeBunnyMp4(...args),
  };
});

const { resolveMp4Source } = await import("./download-source");

const baseVideo = { id: "vid_1", bunnyVideoId: "bunny_abc" };

afterEach(() => {
  vi.clearAllMocks();
});

describe("resolveMp4Source", () => {
  it("Test 1 — available up to and including the configured cap picks 720p", async () => {
    bunnyStreamMp4Url.mockReturnValue("https://cdn.example.com/bunny_abc/play_720p.mp4");
    probeBunnyMp4.mockResolvedValue("ok");

    const result = await resolveMp4Source({
      ...baseVideo,
      hasMp4Fallback: true,
      mp4Resolutions: "360p,480p,720p",
    });

    expect(result).toEqual({ ok: true, url: "https://cdn.example.com/bunny_abc/play_720p.mp4", height: 720 });
    expect(bunnyStreamMp4Url).toHaveBeenCalledWith("bunny_abc", 720);
  });

  it("Test 2 — only lower resolutions available picks 480p, not 720p", async () => {
    bunnyStreamMp4Url.mockReturnValue("https://cdn.example.com/bunny_abc/play_480p.mp4");
    probeBunnyMp4.mockResolvedValue("ok");

    const result = await resolveMp4Source({
      ...baseVideo,
      hasMp4Fallback: true,
      mp4Resolutions: "240p,360p,480p",
    });

    expect(result).toEqual({ ok: true, url: "https://cdn.example.com/bunny_abc/play_480p.mp4", height: 480 });
    expect(bunnyStreamMp4Url).toHaveBeenCalledWith("bunny_abc", 480);
  });

  it("Test 3 — hasMp4Fallback false returns mp4_unavailable without touching Bunny again", async () => {
    const result = await resolveMp4Source({ ...baseVideo, hasMp4Fallback: false, mp4Resolutions: null });

    expect(result).toEqual({ ok: false, reason: "mp4_unavailable" });
    expect(bunnyGetStreamVideo).not.toHaveBeenCalled();
    expect(bunnyStreamMp4Url).not.toHaveBeenCalled();
  });

  it("Test 4 — Bunny/CDN 403 on the resolved URL returns mp4_forbidden, not mp4_unavailable", async () => {
    bunnyStreamMp4Url.mockReturnValue("https://cdn.example.com/bunny_abc/play_720p.mp4");
    probeBunnyMp4.mockResolvedValue("forbidden");

    const result = await resolveMp4Source({
      ...baseVideo,
      hasMp4Fallback: true,
      mp4Resolutions: "720p",
    });

    expect(result).toEqual({ ok: false, reason: "mp4_forbidden" });
  });

  it("Test 5 — Bunny/CDN 404 on the resolved URL returns mp4_missing", async () => {
    bunnyStreamMp4Url.mockReturnValue("https://cdn.example.com/bunny_abc/play_720p.mp4");
    probeBunnyMp4.mockResolvedValue("missing");

    const result = await resolveMp4Source({
      ...baseVideo,
      hasMp4Fallback: true,
      mp4Resolutions: "720p",
    });

    expect(result).toEqual({ ok: false, reason: "mp4_missing" });
  });

  it("returns resolution_unavailable when Bunny's resolutions are all above the configured cap", async () => {
    const result = await resolveMp4Source({
      ...baseVideo,
      hasMp4Fallback: true,
      mp4Resolutions: "1080p",
    });
    // downloadHeight() defaults to 720, so a 1080p-only video has nothing
    // at or under the cap.

    expect(result).toEqual({ ok: false, reason: "resolution_unavailable" });
    expect(bunnyStreamMp4Url).not.toHaveBeenCalled();
  });

  it("fetches and caches metadata when the row has never been synced (hasMp4Fallback: null)", async () => {
    bunnyGetStreamVideo.mockResolvedValue({ hasMP4Fallback: true, availableResolutions: "480p,720p" });
    bunnyStreamMp4Url.mockReturnValue("https://cdn.example.com/bunny_abc/play_720p.mp4");
    probeBunnyMp4.mockResolvedValue("ok");

    const result = await resolveMp4Source({ ...baseVideo, hasMp4Fallback: null, mp4Resolutions: null });

    expect(bunnyGetStreamVideo).toHaveBeenCalledWith("bunny_abc");
    expect(videoUpdate).toHaveBeenCalledWith({
      where: { id: "vid_1" },
      data: { hasMp4Fallback: true, mp4Resolutions: "480p,720p" },
    });
    expect(result).toEqual({ ok: true, url: "https://cdn.example.com/bunny_abc/play_720p.mp4", height: 720 });
  });

  it("does not re-fetch Bunny on every request once a video is cached as having no fallback", async () => {
    // Guards against turning every download tap on an unsynced-forever video
    // into a live call to Bunny's API — recovery is the sync cron's job.
    const result = await resolveMp4Source({ ...baseVideo, hasMp4Fallback: false, mp4Resolutions: null });

    expect(result).toEqual({ ok: false, reason: "mp4_unavailable" });
    expect(bunnyGetStreamVideo).not.toHaveBeenCalled();
  });

  it("reports bunny_error, not mp4_unavailable, when the metadata fetch itself fails", async () => {
    bunnyGetStreamVideo.mockRejectedValue(new Error("Bunny Stream get video failed: 500"));

    const result = await resolveMp4Source({ ...baseVideo, hasMp4Fallback: null, mp4Resolutions: null });

    expect(result).toEqual({ ok: false, reason: "bunny_error" });
  });

  it("a network error on the diagnostic probe does not block a download Bunny's API confirmed", async () => {
    bunnyStreamMp4Url.mockReturnValue("https://cdn.example.com/bunny_abc/play_720p.mp4");
    probeBunnyMp4.mockResolvedValue("error");

    const result = await resolveMp4Source({
      ...baseVideo,
      hasMp4Fallback: true,
      mp4Resolutions: "720p",
    });

    expect(result).toEqual({ ok: true, url: "https://cdn.example.com/bunny_abc/play_720p.mp4", height: 720 });
  });
});
