"use client";

import { useCallback, useEffect, useState } from "react";

type Message = { id: string; direction: "INBOUND" | "OUTBOUND"; body: string; createdAt: string; readAt: string | null };
type Thread = { phone: string; who: string | null; messages: Message[]; unread: number; lastAt: string };

/** Replies, threaded by number. */
export function SmsInbox() {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/sms");
    if (!response.ok) return setError("Couldn't load the inbox.");
    setThreads((await response.json()).threads);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function send(body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "That didn't work.");
      await load();
      return true;
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "That didn't work.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!threads) return <p className="text-sm text-sec">Loading…</p>;
  if (threads.length === 0) return <p className="text-sm text-sec">No replies yet.</p>;

  return (
    <div className="space-y-2">
      {error && <p className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-600">{error}</p>}
      {threads.map((thread) => (
        <div key={thread.phone} className="rounded-lg border border-sep">
          <button
            onClick={() => {
              const next = open === thread.phone ? null : thread.phone;
              setOpen(next);
              if (next && thread.unread > 0) void send({ action: "read", phone: thread.phone });
            }}
            className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm"
          >
            <span className="text-ink">
              {thread.who ?? thread.phone}
              {thread.who && <span className="text-ter"> · {thread.phone}</span>}
            </span>
            <span className="shrink-0 text-xs">
              {thread.unread > 0 && <span className="mr-2 text-accent">{thread.unread} new</span>}
              <span className="text-ter">{thread.lastAt.slice(0, 16).replace("T", " ")}</span>
            </span>
          </button>

          {open === thread.phone && (
            <div className="space-y-2 border-t border-sep px-3 py-3">
              <ul className="space-y-1 text-sm">
                {thread.messages.map((message) => (
                  <li
                    key={message.id}
                    className={message.direction === "INBOUND" ? "text-ink" : "text-sec"}
                  >
                    <span className="text-[11px] tracking-wide text-ter uppercase">
                      {message.direction === "INBOUND" ? "them" : "us"}
                    </span>{" "}
                    {message.body}
                  </li>
                ))}
              </ul>
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (await send({ action: "reply", phone: thread.phone, body: draft })) setDraft("");
                }}
                className="flex gap-2"
              >
                <input
                  value={open === thread.phone ? draft : ""}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Reply"
                  maxLength={1000}
                  className="flex-1 rounded-md border border-sep px-3 py-1.5 text-sm"
                />
                <button
                  type="submit"
                  disabled={busy || !draft.trim()}
                  className="btn-primary rounded-md px-3 py-1.5 text-sm text-white disabled:opacity-60"
                >
                  Send
                </button>
              </form>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
