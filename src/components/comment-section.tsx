"use client";

import { useState } from "react";
import { getDisplayName } from "@/lib/profile";

type CommentUser = { id: string; name: string | null; displayName: string | null; email: string; picture: string | null };
type Reply = { id: string; body: string; createdAt: string; userId: string; user: CommentUser };
type Comment = Reply & { replies: Reply[] };

export function CommentSection({
  type,
  id,
  currentUserId,
  canModerate,
  initialComments,
}: {
  type: "series" | "video";
  id: string;
  currentUserId: string | null;
  canModerate: boolean;
  initialComments: Comment[];
}) {
  const [comments, setComments] = useState(initialComments);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replyPosting, setReplyPosting] = useState(false);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());

  async function load() {
    const res = await fetch(`/api/comments?type=${type}&id=${id}`);
    if (res.ok) setComments(await res.json());
  }

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

  async function postReply(e: React.FormEvent, parentId: string) {
    e.preventDefault();
    if (!replyBody.trim()) return;
    setReplyPosting(true);
    setError(null);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id, body: replyBody, parentId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to post reply");
      setReplyBody("");
      setReplyingTo(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post reply");
    } finally {
      setReplyPosting(false);
    }
  }

  async function remove(commentId: string) {
    if (!confirm("Delete this comment?")) return;
    await fetch(`/api/comments/${commentId}`, { method: "DELETE" });
    await load();
  }

  async function report(commentId: string) {
    setReportedIds((prev) => new Set(prev).add(commentId));
    await fetch(`/api/comments/${commentId}/report`, { method: "POST" });
  }

  const replyCount = comments.reduce((sum, c) => sum + c.replies.length, 0);

  return (
    <section className="space-y-4">
      <h2 className="text-[11px] font-bold tracking-[0.08em] text-ter uppercase">
        Comments {comments.length + replyCount > 0 && `(${comments.length + replyCount})`}
      </h2>

      {currentUserId ? (
        <form onSubmit={post} className="space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment…"
            rows={2}
            className="w-full rounded-md border border-sep px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={posting || !body.trim()}
            className="rounded-md btn-primary text-white px-4 py-1.5 text-sm disabled:opacity-50"
          >
            {posting ? "Posting…" : "Post"}
          </button>
        </form>
      ) : (
        <p className="text-sm text-sec">
          <a href="/auth/login" className="underline">
            Log in
          </a>{" "}
          to leave a comment.
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="space-y-3">
        {comments.map((c) => (
          <li key={c.id} className="rounded-lg border border-sep p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{getDisplayName(c.user)}</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-ter">
                  {new Date(c.createdAt).toLocaleString()}
                </span>
                {currentUserId && c.userId !== currentUserId && (
                  <button
                    onClick={() => report(c.id)}
                    disabled={reportedIds.has(c.id)}
                    className="text-xs text-ter hover:underline disabled:no-underline"
                  >
                    {reportedIds.has(c.id) ? "Reported" : "Report"}
                  </button>
                )}
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
            <p className="mt-1 text-sm text-sec whitespace-pre-wrap">
              {c.body}
            </p>

            {currentUserId && (
              <button
                onClick={() => {
                  setReplyingTo(replyingTo === c.id ? null : c.id);
                  setReplyBody("");
                }}
                className="mt-2 text-xs text-sec hover:underline"
              >
                {replyingTo === c.id ? "Cancel" : "Reply"}
              </button>
            )}

            {c.replies.length > 0 && (
              <ul className="mt-3 space-y-3 border-l border-sep pl-3">
                {c.replies.map((r) => (
                  <li key={r.id}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{getDisplayName(r.user)}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-ter">
                          {new Date(r.createdAt).toLocaleString()}
                        </span>
                        {currentUserId && r.userId !== currentUserId && (
                          <button
                            onClick={() => report(r.id)}
                            disabled={reportedIds.has(r.id)}
                            className="text-xs text-ter hover:underline disabled:no-underline"
                          >
                            {reportedIds.has(r.id) ? "Reported" : "Report"}
                          </button>
                        )}
                        {(r.userId === currentUserId || canModerate) && (
                          <button
                            onClick={() => remove(r.id)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-sec whitespace-pre-wrap">
                      {r.body}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {replyingTo === c.id && (
              <form onSubmit={(e) => postReply(e, c.id)} className="mt-3 space-y-2 pl-3">
                <textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder={`Reply to ${getDisplayName(c.user)}…`}
                  rows={2}
                  autoFocus
                  className="w-full rounded-md border border-sep px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={replyPosting || !replyBody.trim()}
                  className="rounded-md btn-primary text-white px-4 py-1.5 text-sm disabled:opacity-50"
                >
                  {replyPosting ? "Posting…" : "Post reply"}
                </button>
              </form>
            )}
          </li>
        ))}
        {comments.length === 0 && <li className="text-sm text-sec">No comments yet.</li>}
      </ul>
    </section>
  );
}
