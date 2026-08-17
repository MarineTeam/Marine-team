import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionIdentity } from "@/lib/current-user";
import {
  hasRedeemedShareToken,
  shareCookiePayload,
  shareLinkStatus,
  shareTargetPath,
  SHARE_COOKIE,
} from "@/lib/share-access";
import { recordShareLinkView } from "@/lib/share-links";

/**
 * Redeems a share link: checks it's still good, remembers the token in a
 * cookie so the recipient keeps access while they browse, and sends them on
 * to the series/video itself.
 *
 * A route handler rather than a page because only a handler can set the
 * cookie; the states that need explaining (expired, revoked, not yours)
 * redirect to /share/unavailable, which renders them.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const [link, identity] = await Promise.all([
    prisma.shareLink.findUnique({
      where: { token },
      select: {
        id: true,
        visibility: true,
        revokedAt: true,
        expiresAt: true,
        passwordHash: true,
        recipients: { select: { email: true } },
        series: { select: { slug: true, published: true, hidden: true, deletedAt: true } },
        video: { select: { slug: true, published: true, hidden: true, deletedAt: true } },
      },
    }),
    getSessionIdentity(),
  ]);

  const status = shareLinkStatus(link, identity?.email ?? null);

  // A private link that landed in a browser with no session: log in first,
  // then come straight back here to redeem it.
  if (status === "login_required") {
    return NextResponse.redirect(new URL(`/auth/login?returnTo=/s/${encodeURIComponent(token)}`, request.url));
  }
  if (status !== "ok" || !link) {
    return NextResponse.redirect(new URL(`/share/unavailable?reason=${status}`, request.url));
  }

  // The link outlived its target: unpublished, trashed, or hard-deleted since
  // it was shared. Same dead end for the recipient as an expired link.
  const target = link.video ?? link.series;
  const path = shareTargetPath(link);
  if (!path || !target || target.deletedAt || !target.published || target.hidden) {
    return NextResponse.redirect(new URL("/share/unavailable?reason=gone", request.url));
  }

  // Password-protected and not unlocked in this browser yet: hand off to the
  // unlock page, which posts to /api/share-links/unlock. Nothing is recorded
  // and no cookie is set here — getting the cookie *is* being unlocked.
  if (link.passwordHash && !(await hasRedeemedShareToken(token))) {
    return NextResponse.redirect(new URL(`/share/unlock/${encodeURIComponent(token)}`, request.url));
  }

  await recordShareLinkView(link.id);

  const response = NextResponse.redirect(new URL(path, request.url));
  response.cookies.set(shareCookiePayload(request.cookies.get(SHARE_COOKIE)?.value, token));
  return response;
}
