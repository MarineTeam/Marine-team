import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";

/**
 * The deployment's skin — its name and its three accent colours — plus the
 * derivation that turns those three into the full set of CSS custom
 * properties the UI is painted with.
 *
 * The split matters: an admin picks a name and three swatches at
 * /admin/branding, and everything else (hover tints, gradients, the
 * dark-mode accent, surface greys) falls out of them here. Components never
 * hard-code a colour; they reference `var(--accent)`, `var(--panel)` and so
 * on, which is what makes re-skinning a form submission rather than a
 * find-and-replace.
 *
 * The functions below the type are pure so they can be unit-tested without a
 * database — see branding.test.ts.
 */

export type Branding = {
  /** Shown in the header and used as the document title suffix. */
  name: string;
  /** The short form for the installed app's icon label and cramped headers. */
  shortName: string;
  /** The primary accent, as #rrggbb. */
  brand: string;
  /** A darker shade, legible as text and icons on light surfaces. */
  brandDeep: string;
  /** A lighter shade: the far end of gradients, and the accent on dark surfaces. */
  brandLight: string;
  /** An optional wordmark/logo image; the initial-in-a-circle is used when absent. */
  logoUrl: string | null;
};

export const DEFAULT_BRANDING: Branding = {
  name: "Marine Team",
  shortName: "Marine Team",
  brand: "#1a8fd1",
  brandDeep: "#0288d1",
  brandLight: "#4fc3f7",
  logoUrl: null,
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Whether a string is a colour we're willing to interpolate into a stylesheet. */
export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value.trim());
}

/** Expands #abc to #aabbcc and lowercases, so downstream code has one shape to handle. */
export function normalizeHex(value: string): string {
  const hex = value.trim().toLowerCase();
  if (hex.length !== 4) return hex;
  return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
}

/** `#1a8fd1` → `26, 143, 209`, ready to drop into an rgb()/rgba() literal. */
export function hexToRgbChannels(value: string): string {
  const hex = normalizeHex(value);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

/**
 * Reads branding out of whatever the database (or an admin form) hands over,
 * falling back per-field.
 *
 * Deliberately tolerant, like parseDeviceSettings: one bad colour shouldn't
 * blank the site's name too. Anything that isn't a valid hex colour is
 * dropped in favour of the default, because the value is interpolated
 * straight into a <style> element — validating here is what keeps that safe.
 */
export function normalizeBranding(raw: unknown): Branding {
  if (!raw || typeof raw !== "object") return DEFAULT_BRANDING;
  const value = raw as Record<string, unknown>;

  const text = (key: "name" | "shortName") => {
    const candidate = value[key];
    if (typeof candidate !== "string") return DEFAULT_BRANDING[key];
    const trimmed = candidate.trim();
    return trimmed === "" ? DEFAULT_BRANDING[key] : trimmed.slice(0, 60);
  };

  const color = (key: "brand" | "brandDeep" | "brandLight") =>
    isHexColor(value[key]) ? normalizeHex(value[key] as string) : DEFAULT_BRANDING[key];

  // Only same-origin paths and https URLs: a logo is rendered on every page,
  // so an attacker-supplied `javascript:` or plain-http source would be a
  // problem on every page too.
  const logo = typeof value.logoUrl === "string" ? value.logoUrl.trim() : "";
  const logoUrl = logo.startsWith("/") || logo.startsWith("https://") ? logo : null;

  return {
    name: text("name"),
    shortName: text("shortName"),
    brand: color("brand"),
    brandDeep: color("brandDeep"),
    brandLight: color("brandLight"),
    logoUrl,
  };
}

/**
 * The full token set as CSS text, ready for a <style> element in <head>.
 *
 * Surface colours flip with the theme; the brand colours don't, with one
 * exception — `--accent` resolves to the deep shade on light backgrounds and
 * the light shade on dark ones, because a single mid-blue can't stay legible
 * against both. Components should reach for `--accent` rather than
 * `--brand-deep` for exactly that reason.
 *
 * The dark block is keyed off `.dark` on <html>, matching the class the theme
 * script in the root layout stamps before first paint.
 */
export function brandingCss(branding: Branding): string {
  const b = normalizeBranding(branding);
  const accentRgb = hexToRgbChannels(b.brandDeep);
  const lightRgb = hexToRgbChannels(b.brandLight);

  return `:root{
--brand:${b.brand};
--brand-deep:${b.brandDeep};
--brand-light:${b.brandLight};
--accent:${b.brandDeep};
--accent-rgb:${accentRgb};
--bg:#f4f6f9;
--panel:#ffffff;
--text:#111418;
--sec:#6b7280;
--ter:#9aa1ab;
--sep:rgba(16,24,40,.08);
--hover:rgba(${accentRgb},.07);
--accent-soft:rgba(${accentRgb},.10);
--chip:#eef2f6;
--grad-brand:linear-gradient(135deg,${b.brandLight},${b.brandDeep});
}
:root.dark{
--accent:${b.brandLight};
--accent-rgb:${lightRgb};
--bg:#0c1117;
--panel:#161d26;
--text:#f2f5f8;
--sec:rgba(242,245,248,.6);
--ter:rgba(242,245,248,.38);
--sep:rgba(255,255,255,.09);
--hover:rgba(${lightRgb},.10);
--accent-soft:rgba(${lightRgb},.14);
--chip:rgba(255,255,255,.07);
}`;
}

async function getBrandingUncached(): Promise<Branding> {
  // upsert rather than findUnique so a deployment that has never visited the
  // admin form still gets a row, and every later read is a plain hit.
  const row = await prisma.brandSettings.upsert({
    where: { id: "singleton" },
    create: {},
    update: {},
  });
  return normalizeBranding(row);
}

/**
 * Cached twice over, deliberately. `unstable_cache` keeps the row out of the
 * database between requests — branding is identical for every visitor and
 * changes about as often as the logo does. React's `cache` then collapses the
 * several reads a single render makes — the <style> in <head>, the header,
 * the rail, the footer — into one.
 */
export const getBranding = cache(
  unstable_cache(getBrandingUncached, ["branding"], { revalidate: 300, tags: ["branding"] }),
);
