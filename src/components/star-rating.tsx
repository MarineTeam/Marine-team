"use client";

import { useEffect, useState } from "react";

export function StarRating({
  type,
  id,
  canRate,
}: {
  type: "series" | "video";
  id: string;
  canRate: boolean;
}) {
  const [average, setAverage] = useState(0);
  const [count, setCount] = useState(0);
  const [mine, setMine] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const res = await fetch(`/api/ratings?type=${type}&id=${id}`);
    if (res.ok) {
      const data = await res.json();
      setAverage(data.average);
      setCount(data.count);
      setMine(data.mine);
    }
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function rate(value: number) {
    if (!canRate) return;
    const res = await fetch("/api/ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id, value }),
    });
    if (res.ok) {
      const data = await res.json();
      setAverage(data.average);
      setCount(data.count);
      setMine(data.mine);
    }
  }

  if (!loaded) return null;

  const displayValue = hover ?? mine ?? Math.round(average);

  return (
    <div className="flex items-center gap-2">
      <div className="flex" onMouseLeave={() => setHover(null)}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={!canRate}
            onMouseEnter={() => canRate && setHover(star)}
            onClick={() => rate(star)}
            aria-label={`Rate ${star} star${star === 1 ? "" : "s"}`}
            className={`text-lg leading-none ${canRate ? "cursor-pointer" : "cursor-default"} ${
              star <= displayValue ? "text-amber-500" : "text-zinc-300 dark:text-zinc-700"
            }`}
          >
            ★
          </button>
        ))}
      </div>
      {count > 0 ? (
        <span className="text-sm text-zinc-500">
          {average.toFixed(1)} ({count})
        </span>
      ) : (
        <span className="text-sm text-zinc-500">No ratings yet</span>
      )}
    </div>
  );
}
