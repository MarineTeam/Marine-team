"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Message = { id: string; by: string; body: string; at: string; canRemove: boolean };
type State = "off" | "not-yet" | "open" | "ended";

/** How often to ask. Fast enough to feel live, slow enough not to be a load test. */
const POLL_MS = 4000;

/**
 * The chat beside a live stream.
 *
 * Polling rather than a socket, because this app runs on serverless functions
 * with nothing long-lived to hold one open. Each poll asks only for what has
 * arrived since the last id it saw, so the usual answer is an empty array.
 *
 * The interval is deliberately paused while the tab is hidden: a church leaves
 * this page open on a laptop all week, and asking four times a minute for
 * three days to nobody is rude to somebody else's server bill.
 */
export function LiveChat({
  streamId,
  signedIn,
  initialState,
  message,
}: {
  streamId: string;
  signedIn: boolean;
  initialState: State;
  message: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<State>(initialState);
  const [canModerate, setCanModerate] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const since = useRef<string | null>(null);
  const list = useRef<HTMLDivElement | null>(null);

  const poll = useCallback(async () => {
    const query = since.current ? `?since=${encodeURIComponent(since.current)}` : "";
    const response = await fetch(`/api/live/${streamId}/chat${query}`);
    if (!response.ok) return;
    const body = await response.json();
    setState(body.state);
    setCanModerate(body.canModerate);
    if (body.messages.length > 0) {
      since.current = body.messages[body.messages.length - 1].id;
      setMessages((current) => {
        // Cap what is held: a service running for two hours is a lot of
        // messages, and nobody scrolls back through all of them.
        const next = [...current, ...body.messages];
        return next.length > 300 ? next.slice(-300) : next;
      });
    }
  }, [streamId]);

  useEffect(() => {
    void poll();
    const timer = window.setInterval(() => {
      if (!document.hidden) void poll();
    }, POLL_MS);
    // Come back straight away rather than waiting out the interval.
    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  useEffect(() => {
    const node = list.current;
    if (!node) return;
    // Only follow along if they were already at the bottom — yanking the view
    // away from somebody reading back is worse than a missed message.
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
    if (nearBottom) node.scrollTop = node.scrollHeight;
  }, [messages]);

  async function send(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/live/${streamId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Couldn't send that.");
      setDraft("");
      await poll();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Couldn't send that.");
    } finally {
      setSending(false);
    }
  }

  async function remove(item: Message) {
    await fetch(`/api/live/${streamId}/chat/${item.id}`, { method: "DELETE" });
    setMessages((current) => current.filter((m) => m.id !== item.id));
  }

  async function mute(item: Message) {
    if (!window.confirm(`Stop ${item.by} posting in this chat, and hide what they've written?`)) return;
    await fetch(`/api/live/${streamId}/chat/mute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: item.id, removeTheirs: true }),
    });
    setMessages((current) => current.filter((m) => m.by !== item.by));
  }

  if (state === "off") return null;

  return (
    <section className="flex h-96 flex-col rounded-lg border border-sep">
      <h2 className="border-b border-sep px-3 py-2 text-sm font-semibold text-ink">Chat</h2>

      <div ref={list} className="flex-1 space-y-2 overflow-y-auto px-3 py-2">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-sec">Nothing said yet.</p>
        ) : (
          messages.map((item) => (
            <div key={item.id} className="group text-sm">
              <span className="font-medium text-ink">{item.by}</span>{" "}
              <span className="whitespace-pre-wrap text-sec">{item.body}</span>
              {(item.canRemove || canModerate) && (
                <span className="ml-2 hidden gap-2 text-xs text-ter group-hover:inline-flex">
                  <button onClick={() => remove(item)} className="hover:underline">
                    Remove
                  </button>
                  {canModerate && (
                    <button onClick={() => mute(item)} className="hover:underline">
                      Mute
                    </button>
                  )}
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {state === "open" && signedIn ? (
        <form onSubmit={send} className="flex gap-2 border-t border-sep p-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
            placeholder="Say something…"
            className="flex-1 rounded-md border border-sep px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="btn-primary rounded-md px-3 py-1.5 text-sm text-white disabled:opacity-60"
          >
            Send
          </button>
        </form>
      ) : (
        <p className="border-t border-sep px-3 py-2 text-xs text-sec">
          {state === "open" ? "Sign in to join the chat." : message}
        </p>
      )}
      {error && <p className="px-3 pb-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}
