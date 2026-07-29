/** "83" -> "1:23", "3723" -> "1:02:03" */
export function formatTimestamp(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Parses "1:23" or "1:02:03" into seconds; returns null if unparseable. */
export function parseTimestamp(value: string): number | null {
  const parts = value.trim().split(":").map((p) => Number(p));
  if (parts.length === 0 || parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}
