import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hasCapability } from "@/lib/permissions";
import { sendEmail } from "@/lib/email";
import { recordNotifications } from "@/lib/inbox";
import { getDisplayName } from "@/lib/profile";
import { generateShareToken } from "@/lib/share-access";
import { hashSharePassword, SHARE_PASSWORD_MIN_LENGTH } from "@/lib/share-password";
import type { ShareVisibility, User } from "@prisma/client";

/**
 * Creating, listing, and revoking share links. Redemption and the access a
 * redeemed link confers live in src/lib/share-access.ts.
 */

/**
 * Whether `sharer` may create this link, and whether it should grant access.
 *
 * Overriding the gate is opt-in per link (`grantAccessRequested`), not a
 * consequence of who is sharing — that's what lets an admin hand one guest
 * access to a members-only series without loosening it for anyone else, and
 * lets the same admin send an ordinary link when no override is wanted.
 *
 * Three outcomes:
 *  - Content already public to anyone: anybody may share it, and there is
 *    nothing to override, so the request is moot.
 *  - Gated content, no override asked for: anybody may share it. The link is a
 *    plain tracked link — recipients still need their own access, so this is
 *    just "here's the one I was watching" between two members.
 *  - Gated content with an override: only an admin or someone holding the
 *    `share_content` capability, and their link carries a real grant.
 *
 * Kept pure and separate from the DB lookups that establish its inputs.
 */
export function shareLinkPolicy({
  canShareRestricted,
  targetIsRestricted,
  grantAccessRequested,
}: {
  canShareRestricted: boolean;
  targetIsRestricted: boolean;
  grantAccessRequested: boolean;
}): { allowed: true; grantsAccess: boolean } | { allowed: false; reason: string } {
  if (!targetIsRestricted) return { allowed: true, grantsAccess: false };
  if (!grantAccessRequested) return { allowed: true, grantsAccess: false };
  if (canShareRestricted) return { allowed: true, grantsAccess: true };
  return {
    allowed: false,
    reason:
      "You need the “Share restricted content” permission to give someone access to this. " +
      "You can still share a plain link, which only opens for people who already have access.",
  };
}

/** Whether a series/video is gated at all, which decides which policy tier above applies. */
export async function isTargetRestricted(target: {
  type: "series" | "video";
  id: string;
  memberOnly: boolean;
}): Promise<boolean> {
  if (target.memberOnly) return true;
  const [groupGrants, userGrants] =
    target.type === "series"
      ? await Promise.all([
          prisma.seriesViewerGroup.count({ where: { seriesId: target.id } }),
          prisma.seriesViewer.count({ where: { seriesId: target.id } }),
        ])
      : await Promise.all([
          prisma.videoViewerGroup.count({ where: { videoId: target.id } }),
          prisma.videoViewer.count({ where: { videoId: target.id } }),
        ]);
  return groupGrants > 0 || userGrants > 0;
}

/**
 * Whether `user` may hand out links to gated content — an admin, or someone
 * holding the `share_content` capability either site-wide or scoped to this
 * content's category/series, so a group can be given sharing rights over just
 * their own section.
 */
export async function canShareRestrictedContent(
  user: User,
  scope?: { categoryId?: string | null; seriesId?: string | null },
): Promise<boolean> {
  return hasCapability(user, "share_content", scope);
}

/** Whether the given number of days is an expiry we'll accept, or null for "never expires". */
export function expiryFromDays(days: number | null | undefined): Date | null {
  if (!days) return null;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/**
 * Splits and normalizes a recipient list typed as free text (commas,
 * semicolons, or newlines — however the sharer pasted it), lowercased and
 * de-duplicated so the unique index on (shareLinkId, email) can't trip on
 * "Bob@x.com" vs "bob@x.com".
 */
export function parseRecipientEmails(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(/[\s,;]+/)) {
    const email = part.trim().toLowerCase();
    if (email && email.includes("@")) seen.add(email);
  }
  return [...seen];
}

export type ShareTarget = { type: "series" | "video"; id: string };

export type ShareOptions = {
  /** Whether to render the share control on this page at all. */
  canShare: boolean;
  /** Whether this content is gated, i.e. whether an override would mean anything. */
  targetIsRestricted: boolean;
  /** Whether to offer the override checkbox — restricted content plus the permission to lift it. */
  canGrantAccess: boolean;
};

/**
 * What sharing controls to show for one series/video, resolved server-side so
 * the form only offers what createShareLink would actually accept.
 *
 * Any logged-in member can share (the plugin gate is the caller's to check),
 * because a link with no override is harmless; the override checkbox is the
 * part that needs the capability, and only appears when there's something to
 * override.
 */
export async function getShareOptions(
  user: User | null,
  target: {
    type: "series" | "video";
    id: string;
    memberOnly: boolean;
    categoryId: string | null;
    seriesId?: string | null;
  },
): Promise<ShareOptions> {
  if (!user) return { canShare: false, targetIsRestricted: false, canGrantAccess: false };

  const [targetIsRestricted, canShareRestricted] = await Promise.all([
    isTargetRestricted(target),
    canShareRestrictedContent(user, {
      categoryId: target.categoryId,
      seriesId: target.type === "series" ? target.id : (target.seriesId ?? null),
    }),
  ]);
  return {
    canShare: true,
    targetIsRestricted,
    canGrantAccess: targetIsRestricted && canShareRestricted,
  };
}

/**
 * Explicit rather than `include`, which would sweep up `passwordHash` — the one
 * column on this table that must never leave the server.
 */
const LINK_SELECT = {
  id: true,
  token: true,
  visibility: true,
  grantsAccess: true,
  note: true,
  passwordHash: true,
  expiresAt: true,
  revokedAt: true,
  viewCount: true,
  lastViewedAt: true,
  createdAt: true,
  recipients: { select: { email: true }, orderBy: { email: "asc" } },
  series: { select: { title: true, slug: true } },
  video: { select: { title: true, slug: true } },
  createdBy: { select: { email: true, name: true, displayName: true } },
} as const;

/**
 * Swaps the stored hash for the only fact a client needs about it — that a
 * password exists. Every path that returns a link to a browser goes through
 * here, so there's one place to be sure of rather than one per route.
 */
function toShareLinkDto<T extends { passwordHash: string | null }>(link: T) {
  const { passwordHash, ...rest } = link;
  return { ...rest, passwordProtected: Boolean(passwordHash) };
}

/**
 * Creates a share link, enforcing shareLinkPolicy, and emails the recipients
 * of an EMAIL-visibility link.
 *
 * Throws a ready NextResponse on refusal, like the guards in
 * src/lib/permissions.ts, so the member route and the admin route behave
 * identically without either restating the rules.
 *
 * Only published, visible content can be shared: an unpublished or trashed
 * series/video doesn't resolve on its own page either (see getVideoBySlug),
 * so a link to one would 404 for the recipient no matter what it granted.
 */
export async function createShareLink({
  actor,
  target,
  visibility,
  emails,
  note,
  expiresInDays,
  grantAccess = false,
  password,
}: {
  actor: User;
  target: ShareTarget;
  visibility: ShareVisibility;
  emails: string[];
  note?: string | null;
  expiresInDays?: number | null;
  /** Opt in to overriding this content's member-only/viewer restriction — see shareLinkPolicy. */
  grantAccess?: boolean;
  /** Optional passphrase the recipient must type before the link opens. */
  password?: string | null;
}) {
  if (visibility === "EMAIL" && emails.length === 0) {
    throw NextResponse.json({ error: "Add at least one recipient email" }, { status: 400 });
  }

  const publishedAndVisible = { published: true, hidden: false, deletedAt: null };
  // Both branches resolve to the same shape, `seriesId` included — a video
  // inherits its series' scope for the capability check below, and a series is
  // its own scope.
  const row =
    target.type === "series"
      ? await prisma.series
          .findFirst({
            where: { id: target.id, ...publishedAndVisible },
            select: { id: true, title: true, memberOnly: true, categoryId: true },
          })
          .then((series) => (series ? { ...series, seriesId: series.id } : null))
      : await prisma.video.findFirst({
          where: { id: target.id, ...publishedAndVisible },
          select: { id: true, title: true, memberOnly: true, categoryId: true, seriesId: true },
        });
  if (!row) {
    throw NextResponse.json({ error: "That content isn't available to share" }, { status: 404 });
  }

  const [targetIsRestricted, canShareRestricted] = await Promise.all([
    isTargetRestricted({ type: target.type, id: row.id, memberOnly: row.memberOnly }),
    canShareRestrictedContent(actor, { categoryId: row.categoryId, seriesId: row.seriesId }),
  ]);

  const policy = shareLinkPolicy({ canShareRestricted, targetIsRestricted, grantAccessRequested: grantAccess });
  if (!policy.allowed) throw NextResponse.json({ error: policy.reason }, { status: 403 });

  const trimmedPassword = password?.trim() || null;
  if (trimmedPassword && trimmedPassword.length < SHARE_PASSWORD_MIN_LENGTH) {
    throw NextResponse.json(
      { error: `A share password needs at least ${SHARE_PASSWORD_MIN_LENGTH} characters` },
      { status: 400 },
    );
  }

  const link = await prisma.shareLink.create({
    data: {
      token: generateShareToken(),
      createdById: actor.id,
      seriesId: target.type === "series" ? row.id : null,
      videoId: target.type === "video" ? row.id : null,
      visibility,
      grantsAccess: policy.grantsAccess,
      note: note?.trim() || null,
      passwordHash: trimmedPassword ? await hashSharePassword(trimmedPassword) : null,
      expiresAt: expiryFromDays(expiresInDays),
      ...(visibility === "EMAIL" ? { recipients: { create: emails.map((email) => ({ email })) } } : {}),
    },
    select: LINK_SELECT,
  });

  // Recipients are told the link exists, never the password: the sharer passes
  // that on themselves, out of band, which is the only thing that makes the
  // password a second factor rather than a formality.
  if (visibility === "EMAIL") {
    await notifyRecipients(link, actor, row.title, Boolean(trimmedPassword));
  }
  return toShareLinkDto(link);
}

/**
 * Tells each recipient of a private link that it's waiting for them — by
 * email, and additionally in the profile inbox of any recipient who already
 * has an account here, so the share isn't lost if the email never arrives.
 */
async function notifyRecipients(
  link: { token: string; recipients: { email: string }[] },
  actor: User,
  targetTitle: string,
  passwordProtected: boolean,
): Promise<void> {
  const emails = link.recipients.map((r) => r.email);
  if (emails.length === 0) return;

  const sharer = getDisplayName(actor);
  const subject = `${sharer} shared “${targetTitle}” with you`;
  const body =
    `${sharer} shared “${targetTitle}” with you. Open the link below to watch it.` +
    (passwordProtected ? ` You'll need the password ${sharer} gave you.` : "");
  const path = `/s/${link.token}`;

  const existingUsers = await prisma.user.findMany({
    where: { email: { in: emails }, authorized: true },
    select: { id: true },
  });

  await Promise.all([
    ...emails.map((email) => sendEmail(email, subject, body, path)),
    existingUsers.length > 0
      ? recordNotifications({ title: subject, body, url: path }, existingUsers.map((u) => u.id))
      : Promise.resolve(),
  ]);
}

export type ShareLinkListItem = Awaited<ReturnType<typeof getShareLinks>>[number];

/**
 * Share links for a listing UI. With `createdById` set this is one member's
 * "links I've shared" list; without it, the admin panel's site-wide list.
 */
export async function getShareLinks(filter: { createdById?: string; seriesId?: string; videoId?: string }) {
  const links = await prisma.shareLink.findMany({
    where: {
      ...(filter.createdById ? { createdById: filter.createdById } : {}),
      ...(filter.seriesId ? { seriesId: filter.seriesId } : {}),
      ...(filter.videoId ? { videoId: filter.videoId } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: LINK_SELECT,
  });
  return links.map(toShareLinkDto);
}

/** Sets `revokedAt`, killing the link everywhere without losing the record that it existed. */
export async function revokeShareLink(id: string): Promise<void> {
  await prisma.shareLink.update({ where: { id }, data: { revokedAt: new Date() } });
}

/** Records that a link was opened, for the "opened 3 times" column in both listings. */
export async function recordShareLinkView(id: string): Promise<void> {
  await prisma.shareLink.update({
    where: { id },
    data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
  });
}
