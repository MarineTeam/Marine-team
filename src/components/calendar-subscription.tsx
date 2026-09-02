"use client";

import { useState } from "react";

/**
 * The member's own calendar link.
 *
 * A subscription, not a download: the point is that Sunday's rota arrives on
 * the phone without anybody pressing anything again. So the link is offered as
 * something to copy into a calendar app rather than a file to save, and the two
 * things that can go wrong with a link that *is* a credential — it got out, or
 * it is no longer wanted — are each their own button with their own words.
 */
export function CalendarSubscription({ initialUrl }: { initialUrl: string | null }) {
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "create" | "reset" | "stop") {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      if (action === "stop") {
        const response = await fetch("/api/profile/calendar", { method: "DELETE" });
        if (!response.ok) throw new Error("Couldn't stop the link");
        setUrl(null);
        return;
      }
      const response = await fetch("/api/profile/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: action === "reset" }),
      });
      if (!response.ok) throw new Error("Couldn't make a link");
      setUrl(((await response.json()) as { url: string }).url);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard access is refused in plenty of ordinary situations (an
      // insecure origin, a locked-down browser). The link is on screen and
      // selectable, so this is a missing convenience rather than a failure.
      setError("Couldn't copy — select the link and copy it yourself.");
    }
  }

  return (
    <div className="rounded-lg border border-sep p-4">
      <h3 className="text-sm font-medium text-ink">Your diary, in your calendar</h3>
      <p className="mt-1 text-xs text-sec">
        One link holding what you&apos;re serving at, what you&apos;ve signed up for, and the dates a rota names you
        on. Add it to Google Calendar, Outlook or your phone once and it keeps itself up to date.
      </p>

      {url ? (
        <div className="mt-3 space-y-2">
          <input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-md border border-sep bg-hover px-3 py-2 font-mono text-xs"
          />
          <p className="text-xs text-ter">
            Anyone with this link can see your diary, so treat it like a password. If it gets out, replace it — every
            calendar following the old one stops.
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={copy} disabled={busy} className="rounded-md border border-sep px-3 py-1.5 text-sm hover:bg-hover">
              {copied ? "Copied" : "Copy link"}
            </button>
            <button onClick={() => act("reset")} disabled={busy} className="rounded-md border border-sep px-3 py-1.5 text-sm hover:bg-hover">
              Replace it
            </button>
            <button onClick={() => act("stop")} disabled={busy} className="rounded-md border border-sep px-3 py-1.5 text-sm hover:bg-hover">
              Stop the link
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => act("create")}
          disabled={busy}
          className="mt-3 rounded-md border border-sep px-3 py-1.5 text-sm hover:bg-hover disabled:opacity-50"
        >
          {busy ? "Making a link…" : "Make me a link"}
        </button>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
