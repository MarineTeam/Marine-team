"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type InboxItem = {
  id: string;
  title: string;
  body: string;
  url: string | null;
  readAt: string | null;
  createdAt: string;
};

function formatWhen(value: string): string {
  const date = new Date(value);
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * The member's notification history. Server-rendered from the page and then
 * mutated in place here: marking one read shouldn't cost a round trip before
 * the dot disappears, so state moves first and the request follows, with
 * router.refresh() bringing the layout's unread badge back in step.
 */
export function InboxList({ initialItems }: { initialItems: InboxItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [error, setError] = useState<string | null>(null);

  const unread = items.filter((item) => !item.readAt);

  /** Applies the change locally, then sends it; a failed request rolls the list back. */
  async function send(next: InboxItem[], request: () => Promise<Response>) {
    const snapshot = items;
    setItems(next);
    setError(null);
    try {
      const res = await request();
      if (!res.ok) throw new Error((await res.json()).error ?? "Something went wrong");
      router.refresh();
    } catch (err) {
      setItems(snapshot);
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  function markRead(item: InboxItem) {
    if (item.readAt) return;
    const now = new Date().toISOString();
    send(
      items.map((i) => (i.id === item.id ? { ...i, readAt: now } : i)),
      () =>
        fetch("/api/inbox", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [item.id] }),
        }),
    );
  }

  function markAllRead() {
    const now = new Date().toISOString();
    send(
      items.map((i) => (i.readAt ? i : { ...i, readAt: now })),
      () => fetch("/api/inbox", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" }),
    );
  }

  function remove(item: InboxItem) {
    send(
      items.filter((i) => i.id !== item.id),
      () => fetch(`/api/inbox?id=${encodeURIComponent(item.id)}`, { method: "DELETE" }),
    );
  }

  function clearAll() {
    if (!confirm("Delete every notification in your inbox?")) return;
    send([], () => fetch("/api/inbox", { method: "DELETE" }));
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Nothing here yet. New content, announcements, and links shared with you will show up in this inbox.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-zinc-500">
          {unread.length > 0 ? `${unread.length} unread` : "All caught up"}
        </span>
        {unread.length > 0 && (
          <button
            onClick={markAllRead}
            className="rounded-md border border-zinc-300 px-3 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Mark all read
          </button>
        )}
        <button
          onClick={clearAll}
          className="rounded-md border border-zinc-300 px-3 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Clear inbox
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {items.map((item) => (
          <li
            key={item.id}
            className={`flex items-start gap-3 p-3 ${item.readAt ? "" : "bg-sky-50/60 dark:bg-sky-950/20"}`}
          >
            <span
              aria-hidden
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.readAt ? "bg-transparent" : "bg-sky-600"}`}
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{item.title}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">{item.body}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                <span>{formatWhen(item.createdAt)}</span>
                {item.url && (
                  <Link href={item.url} onClick={() => markRead(item)} className="underline">
                    Open
                  </Link>
                )}
                {!item.readAt && (
                  <button onClick={() => markRead(item)} className="underline">
                    Mark read
                  </button>
                )}
                <button onClick={() => remove(item)} className="underline">
                  Delete
                </button>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
