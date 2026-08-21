"use client";

import { useState } from "react";

export function StarRating({
  type,
  id,
  canRate,
  initial,
}: {
  type: "series" | "video";
  id: string;
  canRate: boolean;
  initial: { average: number; count: number; mine: number | null };
}) {
  const [average, setAverage] = useState(initial.average);
  const [count, setCount] = useState(initial.count);
  const [mine, setMine] = useState(initial.mine);
  const [hover, setHover] = useState<number | null>(null);

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
              star <= displayValue ? "text-amber-500" : "text-ter"
            }`}
          >
            ★
          </button>
        ))}
      </div>
      {count > 0 ? (
        <span className="text-sm text-sec">
          {average.toFixed(1)} ({count})
        </span>
      ) : (
        <span className="text-sm text-sec">No ratings yet</span>
      )}
    </div>
  );
}
