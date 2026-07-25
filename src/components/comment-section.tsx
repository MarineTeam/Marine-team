"use client";

import { useEffect, useState } from "react";

type Comment = {
  id: string;
  body: string;
  createdAt: string;
  userId: string;
  user: { id: string; name: string | null; email: string; picture: string | null };
};

export function CommentSection({
  type,
  id,
  currentUserId,
  canModerate,
}: {
  type: "series" | "video";
  id: string;
  currentUserId: string | null;
  canModerate: boolean;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/comments?type=${type}&id=${id}`);
    if (res.ok) setComments(await res.json());
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id, body }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to post comment");
      setBody("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post comment");
    } finally {
      setPosting(false);
    }
  }

  async function remove(commentId: string) {
    if (!confirm("Delete this comment?")) return;
    await fetch(`/api/comments/${commentId}`, { method: "DELETE" });
    await load();
  }

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
        Comments {comments.length > 0 && `(${comments.length})`}
      </h2>

      {currentUserId ? (
        <form onSubmit={post} className="space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment…"
            rows={2}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            disabled={posting || !body.trim()}
            className="rounded-md bg-zinc-900 text-white px-4 py-1.5 text-sm hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          >
            {posting ? "Posting…" : "Post"}
          </button>
        </form>
      ) : (
        <p className="text-sm text-zinc-500">
          <a href="/auth/login" className="underline">
            Log in
          </a>{" "}
          to leave a comment.
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="space-y-3">
        {comments.map((c) => (
          <li key={c.id} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{c.user.name ?? c.user.email}</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">
                  {new Date(c.createdAt).toLocaleString()}
                </span>
                {(c.userId === currentUserId || canModerate) && (
                  <button
                    onClick={() => remove(c.id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">
              {c.body}
            </p>
          </li>
        ))}
        {loaded && comments.length === 0 && (
          <li className="text-sm text-zinc-500">No comments yet.</li>
        )}
      </ul>
    </section>
  );
}
