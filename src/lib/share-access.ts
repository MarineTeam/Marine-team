import { randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getSessionIdentity } from "@/lib/current-user";
import type { ShareVisibility } from "@prisma/client";

/**
 * Redeeming a share link and deciding what it lets you see.
 *
 * Kept apart from share-links.ts (which creates, lists, and revokes them) so
 * that content.ts can consult share grants inside canViewSeries/canViewVideo
 * without pulling in the permission and email machinery that link *creation*
 * needs — content.ts is itself a dependency of permissions.ts, and the split
 * keeps that from becoming a cycle.
 */

/**
 * Tokens of share links the current browser has redeemed at /s/[token].
 * Holding the token in a cookie (rather than keeping it in the URL) is what
 * lets a recipient click through from the shared video to the rest of the
 * series without losing access on the first navigation.
 *
 * The cookie is only a list of tokens, never a grant in itself: every request
 * re-checks each token against the DB (revoked? expired? still the right
 * recipient?), so revoking a link takes effect immediately even for someone
 * whose browser already holds it.
 */
export const SHARE_COOKIE = "share_access";

/** How many redeemed tokens one browser keeps; the oldest fall off the end. */
const MAX_COOKIE_TOKENS = 20;

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** 32 URL-safe chars from 24 random bytes — unguessable, and needs no escaping in a link. */
export function generateShareToken(): string {
  return randomBytes(24).toString("base64url");
}

export type ShareLinkStatus = "ok" | "invalid" | "revoked" | "expired" | "login_required" | "forbidden";

type StatusInput = {
  visibility: ShareVisibility;
  revokedAt: Date | null;
  expiresAt: Date | null;
  recipients: { email: string }[];
};

/**
 * Whether a link may be opened right now, and if not, why — kept pure (no DB,
 * no session lookup) so both the redemption route and the per-request grant
 * resolution below agree on the rules.
 *
 * `viewerEmail` is the logged-in session's email, or null for a visitor who
 * isn't logged in. An EMAIL-visibility link distinguishes those two cases: a
 * visitor gets sent to log in, while someone logged in as the wrong person is
 * refused outright.
 */
export function shareLinkStatus(
  link: StatusInput | null,
  viewerEmail: string | null,
  now: Date = new Date(),
): ShareLinkStatus {
  if (!link) return "invalid";
  if (link.revokedAt) return "revoked";
  if (link.expiresAt && link.expiresAt <= now) return "expired";
  if (link.visibility === "PUBLIC") return "ok";

  if (!viewerEmail) return "login_required";
  const allowed = link.recipients.some((r) => r.email === viewerEmail.toLowerCase());
  return allowed ? "ok" : "forbidden";
}

export type ShareGrants = { seriesIds: Set<string>; videoIds: Set<string> };

/** A fresh empty result each time, rather than a shared object callers could mutate. */
const noGrants = (): ShareGrants => ({ seriesIds: new Set(), videoIds: new Set() });

function readCookieTokens(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is string => typeof t === "string" && t.length > 0).slice(0, MAX_COOKIE_TOKENS);
  } catch {
    return [];
  }
}

/**
 * The series/video ids the current browser may view thanks to a redeemed
 * share link. Wrapped in React's `cache()` like getCurrentUser, since
 * canViewSeries/canViewVideo consult it and one page can call those many
 * times (a series page checks every episode).
 *
 * Only links flagged `grantsAccess` are resolved: a link to content that was
 * already public grants nothing, so there's nothing to look up.
 */
export const getShareGrants = cache(async (): Promise<ShareGrants> => {
  let tokens: string[];
  try {
    tokens = readCookieTokens((await cookies()).get(SHARE_COOKIE)?.value);
  } catch {
    // cookies() throws outside a request scope (a cron route importing
    // content.ts, say); no browser means no share cookie either.
    return noGrants();
  }
  if (tokens.length === 0) return noGrants();

  const [links, identity] = await Promise.all([
    prisma.shareLink.findMany({
      where: { token: { in: tokens }, grantsAccess: true, revokedAt: null },
      select: {
        seriesId: true,
        videoId: true,
        visibility: true,
        revokedAt: true,
        expiresAt: true,
        recipients: { select: { email: true } },
      },
    }),
    getSessionIdentity(),
  ]);

  const grants: ShareGrants = { seriesIds: new Set(), videoIds: new Set() };
  for (const link of links) {
    if (shareLinkStatus(link, identity?.email ?? null) !== "ok") continue;
    if (link.seriesId) grants.seriesIds.add(link.seriesId);
    if (link.videoId) grants.videoIds.add(link.videoId);
  }
  return grants;
});

/**
 * Whether this browser has already redeemed `token`.
 *
 * For a password-protected link this is what stands in for "already unlocked":
 * only a successful unlock ever puts the token in the cookie, so holding it is
 * proof the password was typed once — the recipient isn't asked again every
 * time they open the link.
 */
export async function hasRedeemedShareToken(token: string): Promise<boolean> {
  try {
    return readCookieTokens((await cookies()).get(SHARE_COOKIE)?.value).includes(token);
  } catch {
    return false;
  }
}

/** The cookie value + options for a browser that just redeemed `token`, keeping any it already held. */
export function shareCookiePayload(existingRaw: string | undefined, token: string) {
  const tokens = [token, ...readCookieTokens(existingRaw).filter((t) => t !== token)].slice(0, MAX_COOKIE_TOKENS);
  return {
    name: SHARE_COOKIE,
    value: JSON.stringify(tokens),
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  };
}

/** Where a share link points, for redirecting after redemption and for labelling it in a list. */
export function shareTargetPath(link: {
  series: { slug: string } | null;
  video: { slug: string } | null;
}): string | null {
  if (link.video) return `/videos/${link.video.slug}`;
  if (link.series) return `/series/${link.series.slug}`;
  return null;
}
