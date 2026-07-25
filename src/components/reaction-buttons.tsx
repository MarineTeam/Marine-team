"use client";

import { useState } from "react";

type ReactionType = "LIKE" | "DISLIKE";

export function ReactionButtons({
  type,
  id,
  canReact,
  initial,
}: {
  type: "series" | "video";
  id: string;
  canReact: boolean;
  initial: { likes: number; dislikes: number; mine: ReactionType | null };
}) {
  const [likes, setLikes] = useState(initial.likes);
  const [dislikes, setDislikes] = useState(initial.dislikes);
  const [mine, setMine] = useState(initial.mine);

  async function react(value: ReactionType) {
    if (!canReact) return;
    const next = mine === value ? null : value;
    const res = await fetch("/api/reactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id, value: next }),
    });
    if (res.ok) {
      const data = await res.json();
      setLikes(data.likes);
      setDislikes(data.dislikes);
      setMine(data.mine);
    }
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <button
        onClick={() => react("LIKE")}
        disabled={!canReact}
        aria-pressed={mine === "LIKE"}
        className={`rounded-md border px-2 py-1 disabled:cursor-default ${
          mine === "LIKE"
            ? "border-blue-400 text-blue-700 dark:text-blue-400"
            : "border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        }`}
      >
        👍 {likes}
      </button>
      <button
        onClick={() => react("DISLIKE")}
        disabled={!canReact}
        aria-pressed={mine === "DISLIKE"}
        className={`rounded-md border px-2 py-1 disabled:cursor-default ${
          mine === "DISLIKE"
            ? "border-red-400 text-red-700 dark:text-red-400"
            : "border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        }`}
      >
        👎 {dislikes}
      </button>
    </div>
  );
}
