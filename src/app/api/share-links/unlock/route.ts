import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionIdentity } from "@/lib/current-user";
import { errorResponse } from "@/lib/api-guard";
import { shareCookiePayload, shareLinkStatus, shareTargetPath, SHARE_COOKIE } from "@/lib/share-access";
import {
  isUnlockLockedOut,
  isWithinUnlockWindow,
  SHARE_PASSWORD_MAX_LENGTH,
  UNLOCK_LOCKOUT_SECONDS,
  verifySharePassword,
} from "@/lib/share-password";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(1).max(SHARE_PASSWORD_MAX_LENGTH),
});

/**
 * Checks the passphrase on a password-protected share link and, if it's right,
 * redeems the link: records the open and sets the share cookie, exactly as
 * /s/[token] does for an unprotected one. The response carries the path for
 * the browser to follow.
 *
 * Unauthenticated by design — the point of these links is that the recipient
 * may have no account. Wrong guesses are counted on the row and the link stops
 * answering for a while past a threshold (see isUnlockLockedOut), which is what
 * keeps a short passphrase from being walked through at HTTP speed.
 */
export async function POST(request: NextRequest) {
  try {
    const { token, password } = schema.parse(await request.json());

    const [link, identity] = await Promise.all([
      prisma.shareLink.findUnique({
        where: { token },
        select: {
          id: true,
          visibility: true,
          revokedAt: true,
          expiresAt: true,
          passwordHash: true,
          failedUnlockAttempts: true,
          lastFailedUnlockAt: true,
          recipients: { select: { email: true } },
          series: { select: { slug: true, published: true, hidden: true, deletedAt: true } },
          video: { select: { slug: true, published: true, hidden: true, deletedAt: true } },
        },
      }),
      getSessionIdentity(),
    ]);

    const status = shareLinkStatus(link, identity?.email ?? null);
    if (status !== "ok" || !link) {
      // Same wording whatever went wrong, so this endpoint can't be used to
      // enumerate which tokens exist.
      return NextResponse.json({ error: "This link is no longer available" }, { status: 404 });
    }
    if (!link.passwordHash) {
      return NextResponse.json({ error: "This link doesn't need a password" }, { status: 400 });
    }
    if (isUnlockLockedOut(link)) {
      return NextResponse.json(
        { error: `Too many wrong attempts. Try again in ${Math.round(UNLOCK_LOCKOUT_SECONDS / 60)} minutes.` },
        { status: 429 },
      );
    }

    if (!(await verifySharePassword(password, link.passwordHash))) {
      await prisma.shareLink.update({
        where: { id: link.id },
        data: {
          // Adds to the tally only while the previous failure is still recent;
          // otherwise this is the first failure of a new run.
          failedUnlockAttempts: isWithinUnlockWindow(link.lastFailedUnlockAt) ? { increment: 1 } : 1,
          lastFailedUnlockAt: new Date(),
        },
      });
      return NextResponse.json({ error: "That password isn't right" }, { status: 401 });
    }

    const target = link.video ?? link.series;
    const path = shareTargetPath(link);
    if (!path || !target || target.deletedAt || !target.published || target.hidden) {
      return NextResponse.json({ error: "This content isn't available any more" }, { status: 404 });
    }

    // Records the open and clears the failure tally in one write, rather than
    // two updates racing over the same row.
    await prisma.shareLink.update({
      where: { id: link.id },
      data: {
        viewCount: { increment: 1 },
        lastViewedAt: new Date(),
        failedUnlockAttempts: 0,
        lastFailedUnlockAt: null,
      },
    });

    const response = NextResponse.json({ path });
    response.cookies.set(shareCookiePayload(request.cookies.get(SHARE_COOKIE)?.value, token));
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
