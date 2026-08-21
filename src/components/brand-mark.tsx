import type { Branding } from "@/lib/branding";

/**
 * The logo tile: the admin's uploaded mark on a white chip, or the brand's
 * own initial on the brand gradient when no logo has been set.
 *
 * The white chip is deliberate — a logo is drawn for a light background
 * roughly always, so putting one straight onto the dark-mode panel is how you
 * get an invisible wordmark. The chip keeps it legible in both themes.
 */
export function BrandMark({
  branding,
  size = 34,
  className = "",
}: {
  branding: Branding;
  size?: number;
  className?: string;
}) {
  const initial = branding.shortName.trim().charAt(0).toUpperCase() || "M";

  if (!branding.logoUrl) {
    return (
      <span
        aria-hidden
        className={`inline-flex shrink-0 items-center justify-center rounded-[28%] font-bold text-white ${className}`}
        style={{ width: size, height: size, background: "var(--grad-brand)", fontSize: size * 0.45 }}
      >
        {initial}
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[28%] bg-white shadow-sm ring-1 ring-black/5 ${className}`}
      style={{ width: size, height: size }}
    >
      {/*
        A logo URL is admin-supplied and can point at any https host, each of
        which would otherwise need its own next.config remotePatterns entry to
        pass through next/image.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={branding.logoUrl}
        alt=""
        style={{ width: size * 0.74, height: size * 0.74, objectFit: "contain" }}
      />
    </span>
  );
}

/** The mark plus the name, as one link back to the top of the app. */
export function BrandWordmark({
  branding,
  size = 34,
  className = "",
}: {
  branding: Branding;
  size?: number;
  className?: string;
}) {
  return (
    <span className={`flex min-w-0 items-center gap-2.5 ${className}`}>
      <BrandMark branding={branding} size={size} />
      <span className="truncate text-[17px] font-bold tracking-tight text-accent">
        {branding.name}
      </span>
    </span>
  );
}
