"use client";

import { useState } from "react";

export function FavoriteButton({
  type,
  id,
  initialFavorited,
}: {
  type: "series" | "video" | "file";
  id: string;
  initialFavorited: boolean;
}) {
  const [favorited, setFavorited] = useState(initialFavorited);
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id }),
      });
      if (res.ok) {
        const data = await res.json();
        setFavorited(data.favorited);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      aria-pressed={favorited}
      className={`rounded-md border px-3 py-1.5 text-sm disabled:opacity-50 ${
        favorited
          ? "border-amber-400 text-amber-700 dark:text-amber-400"
          : "border-sep hover:bg-hover"
      }`}
    >
      {favorited ? "★ Favorited" : "☆ Favorite"}
    </button>
  );
}
