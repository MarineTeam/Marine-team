import { afterEach, describe, expect, it, vi } from "vitest";
import { TranscribeError, transcribeAudio, transcribeConfig } from "./transcribe";

const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
  vi.restoreAllMocks();
});

describe("transcribeConfig", () => {
  // With nowhere to send audio, the feature is absent rather than broken —
  // every caller checks this before offering anything.
  it("is null when no service is configured", () => {
    delete process.env.TRANSCRIBE_API_URL;
    expect(transcribeConfig()).toBeNull();
  });

  it("defaults the model and the size cap", () => {
    process.env.TRANSCRIBE_API_URL = "https://example.test/v1/audio/transcriptions";
    delete process.env.TRANSCRIBE_MODEL;
    delete process.env.TRANSCRIBE_MAX_BYTES;
    const config = transcribeConfig();
    expect(config?.model).toBe("whisper-1");
    expect(config?.maxBytes).toBe(25 * 1024 * 1024);
    expect(config?.apiKey).toBeNull();
  });

  it("takes a raised cap, for a service that has no small limit", () => {
    process.env.TRANSCRIBE_API_URL = "https://example.test/x";
    process.env.TRANSCRIBE_MAX_BYTES = "500000000";
    expect(transcribeConfig()?.maxBytes).toBe(500_000_000);
  });

  it("ignores a cap that isn't a size", () => {
    process.env.TRANSCRIBE_API_URL = "https://example.test/x";
    process.env.TRANSCRIBE_MAX_BYTES = "lots";
    expect(transcribeConfig()?.maxBytes).toBe(25 * 1024 * 1024);
  });
});

describe("transcribeAudio", () => {
  const config = {
    url: "https://example.test/v1/audio/transcriptions",
    apiKey: "k",
    model: "whisper-1",
    maxBytes: 10,
  };

  // Refused here rather than at the far end, so the admin reads a sentence
  // about file size instead of a 413 from somebody else's server.
  it("refuses a file past the cap without sending it", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(transcribeAudio(config, new Blob(["much too long"]), "a.mp4")).rejects.toBeInstanceOf(
      TranscribeError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends the file and the model, and returns the text", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ text: "  and so we read in Luke  " }), { status: 200 }),
    );
    const text = await transcribeAudio({ ...config, maxBytes: 1000 }, new Blob(["audio"]), "a.mp4");
    expect(text).toBe("and so we read in Luke");

    const body = fetchSpy.mock.calls[0][1]?.body as FormData;
    expect(body.get("model")).toBe("whisper-1");
    expect(body.get("file")).toBeInstanceOf(Blob);
  });

  it("reports what the service said when it refuses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("no such model", { status: 400 }));
    await expect(
      transcribeAudio({ ...config, maxBytes: 1000 }, new Blob(["a"]), "a.mp4"),
    ).rejects.toThrow(/400.*no such model/);
  });

  // A service that answers 200 with nothing has still not transcribed
  // anything, and storing "" would look like a talk with no words in it.
  it("treats an empty answer as a failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ text: "   " }), { status: 200 }),
    );
    await expect(
      transcribeAudio({ ...config, maxBytes: 1000 }, new Blob(["a"]), "a.mp4"),
    ).rejects.toThrow(/no text/);
  });
});
