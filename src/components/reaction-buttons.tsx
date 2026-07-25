"use client";

import { useEffect, useState } from "react";

type ReactionType = "LIKE" | "DISLIKE";

export function ReactionButtons({
  type,
  id,
  canReact,
}: {
  type: "series" | "video";
  id: string;
  canReact: boolean;
}) {
  const [likes, setLikes] = useState(0);
  const [dislikes, setDislikes] = useState(0);
  const [mine, setMine] = useState<ReactionType | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const res = await fetch(`/api/reactions?type=${type}&id=${id}`);
    if (res.ok) {
      const data = await res.json();
      setLikes(data.likes);
      setDislikes(data.dislikes);
      setMine(data.mine);
    }
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  if (!loaded) return null;

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
