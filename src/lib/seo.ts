/** Absolute site URL for JSON-LD, which (unlike next/metadata) has no metadataBase to resolve relative paths against. */
export function siteUrl(path = ""): string {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return path ? `${base}${path}` : base;
}

const MAX_DESCRIPTION_LENGTH = 155;

/** Trims text to a meta-description-friendly length without cutting mid-word. */
export function truncateDescription(text: string, max = MAX_DESCRIPTION_LENGTH): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
