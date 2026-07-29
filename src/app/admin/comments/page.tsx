"use client";

import { useEffect, useState } from "react";
import { getDisplayName } from "@/lib/profile";

type ModeratedComment = {
  id: string;
  body: string;
  hidden: boolean;
  createdAt: string;
  user: { name: string | null; displayName: string | null; email: string };
  series: { id: string; title: string; slug: string } | null;
  video: { id: string; title: string; slug: string } | null;
  _count: { reports: number };
};

export default function CommentsAdminPage() {
  const [comments, setComments] = useState<ModeratedComment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/comments");
    if (res.ok) setComments(await res.json());
    else setError((await res.json()).error ?? "Failed to load");
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function toggleHidden(c: ModeratedComment) {
    await fetch(`/api/admin/comments/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden: !c.hidden }),
    });
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this comment permanently?")) return;
    await fetch(`/api/comments/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Comment moderation</h1>
        <p className="text-sm text-zinc-500">
          Comments reported by members, or already hidden. Hiding keeps a comment out of public view without
          deleting it; deleting is permanent.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
        {comments?.map((c) => (
          <li key={c.id} className="p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                <span className="font-medium">{getDisplayName(c.user)}</span>{" "}
                <span className="text-zinc-500">on </span>
                <a
                  href={c.series ? `/series/${c.series.slug}` : `/videos/${c.video?.slug}`}
                  className="underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {c.series?.title ?? c.video?.title}
                </a>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                {c._count.reports > 0 && (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700 dark:bg-red-900 dark:text-red-300">
                    {c._count.reports} report{c._count.reports === 1 ? "" : "s"}
                  </span>
                )}
                {new Date(c.createdAt).toLocaleString()}
              </div>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">{c.body}</p>
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={() => toggleHidden(c)}
                className={`rounded-md border px-2 py-1 dark:border-zinc-700 ${c.hidden ? "border-amber-400 text-amber-700 dark:text-amber-400" : ""}`}
              >
                {c.hidden ? "Hidden — unhide" : "Hide"}
              </button>
              <button onClick={() => remove(c.id)} className="text-red-600 hover:underline">
                Delete
              </button>
            </div>
          </li>
        ))}
        {comments?.length === 0 && (
          <li className="p-4 text-sm text-zinc-500">Nothing reported or hidden right now.</li>
        )}
      </ul>
    </div>
  );
}
