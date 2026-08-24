"use client";

import { useState } from "react";

type StorageObject = {
  path: string;
  name: string;
  sizeBytes: number;
  contentType: string | null;
};

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/**
 * Swaps the bytes behind a file, keeping the row.
 *
 * The alternative — adding the new scan as a new file and trashing the old
 * one — is the thing this exists to stop. Everything that refers to a book
 * refers to its row: members' saved places and marks, the `?page=` links on
 * its contents list, its podcast episode, and every copy saved to a phone for
 * offline reading. A new row leaves all of that on the old book with nothing
 * to say it has been superseded.
 *
 * Two ways in, because the app's own upload is capped at 4MB by the
 * serverless function it runs through and a scanned hymnal is nowhere near
 * that: a small file straight from here, or an object already uploaded to
 * Bunny Storage.
 */
export function FileReplace({
  file,
  onReplaced,
}: {
  file: { id: string; title: string; bunnyPath: string; sizeBytes: number | null };
  onReplaced: () => Promise<void> | void;
}) {
  const [picked, setPicked] = useState<File | null>(null);
  const [objects, setObjects] = useState<StorageObject[] | null>(null);
  const [chosenPath, setChosenPath] = useState("");
  const [busy, setBusy] = useState<"scanning" | "replacing" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function scan() {
    setBusy("scanning");
    setError(null);
    try {
      const res = await fetch("/api/admin/files/bunny-storage");
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't read Bunny Storage");
      setObjects(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read Bunny Storage");
    } finally {
      setBusy(null);
    }
  }

  async function replace(body: FormData | { path: string }) {
    if (
      !window.confirm(
        `Replace the file behind "${file.title}"? Everyone reading it gets the new one, and devices holding it offline will offer an update.`,
      )
    ) {
      return;
    }
    setBusy("replacing");
    setError(null);
    setDone(null);
    try {
      const res = await fetch(`/api/admin/files/${file.id}/replace`, {
        method: "POST",
        ...(body instanceof FormData
          ? { body }
          : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't replace this file");
      setPicked(null);
      setObjects(null);
      setChosenPath("");
      setDone("Replaced. Re-run “Generate covers” to redraw this book's cover and hymn count.");
      await onReplaced();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't replace this file");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-sep p-3 text-xs">
      <div>
        <p className="text-sm font-medium">Replace the file</p>
        <p className="text-sec">
          Same row, new bytes — a re-scanned book keeps its place in the library, its saved places and
          its offline copies. Currently{" "}
          <code className="break-all">{file.bunnyPath}</code>
          {file.sizeBytes ? ` (${formatSize(file.sizeBytes)})` : ""}.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          onChange={(e) => setPicked(e.target.files?.[0] ?? null)}
          className="max-w-full text-xs"
        />
        <button
          onClick={() => {
            if (!picked) return;
            const form = new FormData();
            form.append("file", picked);
            void replace(form);
          }}
          disabled={!picked || busy !== null}
          className="rounded-md border border-sep px-2 py-1 disabled:opacity-40"
        >
          {busy === "replacing" ? "Replacing…" : "Replace with this"}
        </button>
        <span className="text-ter">up to 4MB</span>
      </div>

      <div className="space-y-2 border-t border-sep pt-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sec">Bigger than that? Upload it to Bunny Storage, then:</span>
          <button
            onClick={scan}
            disabled={busy !== null}
            className="rounded-md border border-sep px-2 py-1 disabled:opacity-40"
          >
            {busy === "scanning" ? "Scanning…" : objects ? "Rescan storage" : "Choose from storage"}
          </button>
        </div>

        {objects?.length === 0 && (
          <p className="text-sec">
            Nothing in Bunny Storage that isn&apos;t already a file here. Upload the new scan to the
            storage zone first.
          </p>
        )}

        {objects && objects.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={chosenPath}
              onChange={(e) => setChosenPath(e.target.value)}
              aria-label="File in Bunny Storage"
              className="max-w-full rounded-md border border-sep px-2 py-1"
            >
              <option value="">Choose a file…</option>
              {objects.map((object) => (
                <option key={object.path} value={object.path}>
                  {object.path} ({formatSize(object.sizeBytes)})
                </option>
              ))}
            </select>
            <button
              onClick={() => chosenPath && void replace({ path: chosenPath })}
              disabled={!chosenPath || busy !== null}
              className="rounded-md border border-sep px-2 py-1 disabled:opacity-40"
            >
              {busy === "replacing" ? "Replacing…" : "Replace with this"}
            </button>
          </div>
        )}
      </div>

      <ul className="list-disc space-y-0.5 pl-4 text-ter">
        <li>The title, series, page offset and every other setting stay as they are.</li>
        <li>
          Saved places and marks stay too — they&apos;re page numbers, so check the page offset if the new
          scan starts differently.
        </li>
        <li>The cover and hymn count are cleared, since they described the old file.</li>
        <li>The old file stays in Bunny Storage; delete it there once you&apos;re happy.</li>
      </ul>

      {error && <p className="text-red-600">{error}</p>}
      {done && <p className="text-green-700 dark:text-green-400">{done}</p>}
    </div>
  );
}
