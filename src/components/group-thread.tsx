"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Message = { id: string; by: string; body: string; at: string; mine: boolean; canRemove: boolean };
/** "loading" is local: the server never sends it. Rendering nothing until the
 * first answer matters here — flashing "the conversation is for people in the
 * group" at somebody who *is* in it reads like being thrown out. */
type State = "loading" | "open" | "not-a-member" | "signed-out";

/**
 * Slower than the live chat's four seconds, on purpose: a group thread is a
 * conversation over days, not a room full of people during a service, and the
 * page can sit open on somebody's desk all afternoon.
 */
const POLL_MS = 20000;
const MAX_LENGTH = 2000;

/**
 * A small group's conversation.
 *
 * Polling, like the live chat, for the same deployment reason. The server
 * decides what this can show: somebody who isn't in the group gets an empty
 * list and a sentence, so a bug here cannot turn into a leak — there is
 * nothing in the component's hands to leak.
 */
export function GroupThread({ slug }: { slug: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<State>("loading");
  const [reason, setReason] = useState("");
  const [muted, setMuted] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const since = useRef<string | null>(null);
  const list = useRef<HTMLDivElement | null>(null);

  const poll = useCallback(async () => {
    const query = since.current ? `?since=${encodeURIComponent(since.current)}` : "";
    const response = await fetch(`/api/groups/${slug}/messages${query}`);
    if (!response.ok) return;
    const body = await response.json();
    setState(body.state);
    setReason(body.reason ?? "");
    setMuted(Boolean(body.muted));
    if (body.messages.length > 0) {
      since.current = body.messages[body.messages.length - 1].id;
      setMessages((current) => {
        const next = [...current, ...body.messages];
        return next.length > 300 ? next.slice(-300) : next;
      });
    }
  }, [slug]);

  useEffect(() => {
    void poll();
    const timer = window.setInterval(() => {
      if (!document.hidden) void poll();
    }, POLL_MS);
    // Come back straight away rather than waiting out twenty seconds.
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
    // Follow along only if they were already at the bottom — yanking the view
    // away from somebody reading back is worse than a missed message.
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
    if (nearBottom) node.scrollTop = node.scrollHeight;
  }, [messages]);

  async function send(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/groups/${slug}/messages`, {
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
    if (!window.confirm(item.mine ? "Delete your message?" : `Take down ${item.by}'s message?`)) return;
    const response = await fetch(`/api/groups/${slug}/messages/${item.id}`, { method: "DELETE" });
    if (response.ok) setMessages((current) => current.filter((m) => m.id !== item.id));
  }

  async function toggleMute() {
    const next = !muted;
    const response = await fetch(`/api/groups/${slug}/messages`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ muted: next }),
    });
    if (response.ok) setMuted(next);
  }

  if (state === "loading") return null;
  if (state !== "open") {
    return (
      <section id="thread" className="rounded-lg border border-sep p-4">
        <h2 className="text-sm font-semibold text-ink">Conversation</h2>
        <p className="mt-1 text-sm text-sec">{reason}</p>
      </section>
    );
  }

  return (
    <section id="thread" className="flex flex-col rounded-lg border border-sep">
      <div className="flex items-center justify-between border-b border-sep px-3 py-2">
        <h2 className="text-sm font-semibold text-ink">Conversation</h2>
        <button onClick={toggleMute} className="text-xs text-ter hover:underline">
          {muted ? "Turn notifications on" : "Mute notifications"}
        </button>
      </div>

      <div ref={list} className="max-h-96 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-sec">Nothing said yet.</p>
        ) : (
          messages.map((item) => (
            <div key={item.id} className="group text-sm">
              <div className="flex items-baseline gap-2">
                <span className="font-medium text-ink">{item.mine ? "You" : item.by}</span>
                <time dateTime={item.at} className="text-xs text-ter">
                  {new Date(item.at).toLocaleString(undefined, {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
                {item.canRemove && (
                  <button
                    onClick={() => remove(item)}
                    className="hidden text-xs text-ter hover:underline group-hover:inline"
                  >
                    {item.mine ? "Delete" : "Take down"}
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sec">{item.body}</p>
            </div>
          ))
        )}
      </div>

      <form onSubmit={send} className="space-y-2 border-t border-sep p-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_LENGTH}
          rows={2}
          placeholder="Write to the group…"
          className="w-full rounded-md border border-sep px-3 py-1.5 text-sm"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-ter">
            {muted ? "You won't be notified about replies." : "Everyone in the group is notified."}
          </span>
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="btn-primary rounded-md px-3 py-1.5 text-sm text-white disabled:opacity-60"
          >
            Send
          </button>
        </div>
      </form>
      {error && <p className="px-3 pb-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}
