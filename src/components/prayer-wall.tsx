"use client";

import { useCallback, useEffect, useState } from "react";
import { format, type Messages } from "@/lib/i18n";

type Prayer = {
  id: string;
  by: string;
  body: string;
  status: string;
  answeredNote: string | null;
  answeredAt: string | null;
  createdAt: string;
  prayers: number;
  prayed: boolean;
  mine: boolean;
};

/**
 * The wall.
 *
 * Everything on it arrived through one server-side function that decides what
 * this reader may see and what they may be told about who wrote it — so this
 * component never has an account id to leak, and never has to remember not to
 * print one.
 */
export function PrayerWall({ signedIn, t }: { signedIn: boolean; t: Messages["prayer"] }) {
  const [requests, setRequests] = useState<Prayer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [visibility, setVisibility] = useState("MEMBERS");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/prayer");
    if (response.ok) setRequests((await response.json()).requests);
    setLoaded(true);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function submit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/prayer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          name: anonymous ? null : name || null,
          anonymous,
          visibility,
        }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? t.couldntSend);
      setBody("");
      setSent(true);
      await load();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : t.couldntSend);
    } finally {
      setBusy(false);
    }
  }

  async function pray(request: Prayer) {
    const response = await fetch(`/api/prayer/${request.id}/pray`, { method: "POST" });
    if (!response.ok) return;
    const { prayers } = await response.json();
    setRequests((current) =>
      current.map((item) => (item.id === request.id ? { ...item, prayers, prayed: true } : item)),
    );
  }

  async function remove(request: Prayer) {
    if (!window.confirm(t.takeThisDown)) return;
    const response = await fetch(`/api/prayer/${request.id}`, { method: "DELETE" });
    if (response.ok) await load();
  }

  const field = "mt-1 w-full rounded-md border border-sep px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-3 rounded-lg border border-sep p-4">
        <p className="text-sm font-medium text-ink">{t.askForPrayer}</p>
        <textarea
          required
          rows={3}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setSent(false);
          }}
          placeholder={t.whatToPrayFor}
          className={field}
        />

        {!anonymous && (
          <label className="block text-sm">
            <span className="text-sec">{t.yourNameOptional}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </label>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(e) => setAnonymous(e.target.checked)}
          />
          {t.postAnonymously}
        </label>

        {signedIn && (
          <label className="block text-sm">
            <span className="text-sec">{t.whoCanSee}</span>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              className={field}
            >
              <option value="MEMBERS">{t.seenByMembers}</option>
              <option value="EVERYONE">{t.seenByEveryone}</option>
              <option value="LEADERS">{t.seenByLeaders}</option>
            </select>
          </label>
        )}

        <button
          type="submit"
          disabled={busy}
          className="btn-primary rounded-md px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {busy ? "…" : t.send}
        </button>
        {sent && (
          <p className="text-xs text-sec">
            {t.willBeRead}
          </p>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>

      {loaded && requests.length === 0 ? (
        <p className="rounded-lg border border-dashed border-sep p-8 text-center text-sm text-sec">
          {t.nothingOnWall}
        </p>
      ) : (
        <ul className="space-y-3">
          {requests.map((request) => (
            <li key={request.id} className="space-y-2 rounded-lg border border-sep p-4">
              {request.status === "PENDING" && (
                <p className="text-xs text-ter">{t.waitingToBeRead}</p>
              )}
              <p className="text-sm whitespace-pre-wrap text-ink">{request.body}</p>

              {request.answeredNote && (
                <p className="rounded-md border border-green-300 px-3 py-2 text-sm text-green-800 dark:border-green-900 dark:text-green-300">
                  {t.answered}: {request.answeredNote}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-sec">
                <span>
                  {request.by} · {new Date(request.createdAt).toLocaleDateString("en-GB")}
                </span>
                <span className="flex items-center gap-2">
                  {signedIn && request.status !== "PENDING" && (
                    <button
                      onClick={() => pray(request)}
                      disabled={request.prayed}
                      className="rounded-md border border-sep px-2 py-1 hover:bg-hover disabled:opacity-60"
                    >
                      {request.prayed ? `✓ ${t.youPrayed}` : t.iPrayed}
                    </button>
                  )}
                  {request.prayers > 0 && (
                    <span>
                      {request.prayers === 1
                        ? t.onePersonPrayed
                        : format(t.peoplePrayed, { count: request.prayers })}
                    </span>
                  )}
                  {request.mine && (
                    <button
                      onClick={() => remove(request)}
                      className="rounded-md border border-sep px-2 py-1 hover:bg-hover"
                    >
                      {t.takeDown}
                    </button>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
