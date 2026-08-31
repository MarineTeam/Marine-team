/**
 * Turning a talk's audio into text, automatically.
 *
 * The app has had transcripts since the Transcripts plugin shipped, typed or
 * pasted in by an admin — which means in practice most videos have none, and
 * the search that reads them finds nothing on the ones nobody had an hour to
 * sit with.
 *
 * There is no transcription in the Claude API (it takes text, images and
 * documents), so this speaks to a **separate speech-to-text service**, named
 * by environment variable. The request is the shape every one of them
 * implements — `POST` multipart with a `file` field, answering with `{ text }`
 * — so a church can point it at a hosted API or at a Whisper server on a
 * machine in the office without this code caring which.
 *
 * Nothing here runs unless `TRANSCRIBE_API_URL` is set. With it unset the
 * feature is simply absent, which is the honest state for a deployment that
 * has nowhere to send the audio.
 */

export type TranscribeConfig = {
  url: string;
  apiKey: string | null;
  model: string;
  /** Bytes above which we don't even try — most hosted endpoints refuse ~25MB. */
  maxBytes: number;
};

/**
 * Where the audio goes, or null when nowhere is configured.
 *
 * Read per call rather than at module load: a serverless instance outlives a
 * deploy's environment often enough that caching it would be a way to keep
 * using a URL that has been changed.
 */
export function transcribeConfig(): TranscribeConfig | null {
  const url = process.env.TRANSCRIBE_API_URL?.trim();
  if (!url) return null;
  const maxBytes = Number(process.env.TRANSCRIBE_MAX_BYTES);
  return {
    url,
    apiKey: process.env.TRANSCRIBE_API_KEY?.trim() || null,
    model: process.env.TRANSCRIBE_MODEL?.trim() || "whisper-1",
    // 25MB, which is what the common hosted endpoints accept. A self-hosted
    // server usually has no such limit and can be told so.
    maxBytes: Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : 25 * 1024 * 1024,
  };
}

/** What went wrong, in words an admin can act on rather than a status code. */
export class TranscribeError extends Error {}

/**
 * Sends one file's bytes for transcription and returns the text.
 *
 * The audio is passed through this server rather than the service being
 * pointed at the media URL: those URLs are signed and short-lived (see
 * bunnyStreamMp4Url), and handing a third party a key to the library is a
 * different thing from handing it one file.
 */
export async function transcribeAudio(
  config: TranscribeConfig,
  audio: Blob,
  filename: string,
  signal?: AbortSignal,
): Promise<string> {
  if (audio.size > config.maxBytes) {
    throw new TranscribeError(
      `That file is ${Math.round(audio.size / 1024 / 1024)}MB and the transcription service accepts ${Math.round(
        config.maxBytes / 1024 / 1024,
      )}MB. Point TRANSCRIBE_API_URL at a service that takes larger files, or raise TRANSCRIBE_MAX_BYTES if it already does.`,
    );
  }

  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", config.model);
  // Plain text back rather than JSON with timestamps: what this fills in is a
  // transcript panel and a search index, both of which want prose.
  form.append("response_format", "json");

  const response = await fetch(config.url, {
    method: "POST",
    headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : undefined,
    body: form,
    signal,
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new TranscribeError(
      `The transcription service answered ${response.status}${detail ? `: ${detail}` : ""}`,
    );
  }

  const data = (await response.json().catch(() => null)) as { text?: unknown } | null;
  if (!data || typeof data.text !== "string" || !data.text.trim()) {
    throw new TranscribeError("The transcription service answered with no text.");
  }
  return data.text.trim();
}
