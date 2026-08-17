import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hasCapability } from "@/lib/permissions";
import { sendEmail } from "@/lib/email";
import { recordNotifications } from "@/lib/inbox";
import { getDisplayName } from "@/lib/profile";
import { generateShareToken } from "@/lib/share-access";
import type { ShareVisibility, User } from "@prisma/client";

/**
 * Creating, listing, and revoking share links. Redemption and the access a
 * redeemed link confers live in src/lib/share-access.ts.
 */

/**
 * Whether `sharer` may create this link, and whether it should grant access.
 *
 * Two tiers, so that letting members share doesn't punch a hole in the access
 * model:
 *  - Content already public to anyone: anybody may share it, and the link
 *    grants nothing the recipient didn't already have.
 *  - Content that's gated (member-only, or restricted to viewer
 *    groups/users): only an admin or someone holding the `share_content`
 *    capability may share it, and their link carries a real grant.
 *
 * Kept pure and separate from the DB lookups that establish its two inputs.
 */
export function shareLinkPolicy({
  canShareRestricted,
  targetIsRestricted,
}: {
  canShareRestricted: boolean;
  targetIsRestricted: boolean;
}): { allowed: true; grantsAccess: boolean } | { allowed: false; reason: string } {
  if (!targetIsRestricted) return { allowed: true, grantsAccess: false };
  if (canShareRestricted) return { allowed: true, grantsAccess: true };
  return {
    allowed: false,
    reason: "This content is restricted — you need the “Share restricted content” permission to share it.",
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

/**
 * Whether to offer the share control on a series/video page at all — the same
 * policy createShareLink enforces, asked ahead of time so a member who
 * couldn't share this particular item isn't shown a form that can only fail.
 */
export async function canShareTarget(
  user: User | null,
  target: {
    type: "series" | "video";
    id: string;
    memberOnly: boolean;
    categoryId: string | null;
    seriesId?: string | null;
  },
): Promise<boolean> {
  if (!user) return false;
  const [targetIsRestricted, canShareRestricted] = await Promise.all([
    isTargetRestricted(target),
    canShareRestrictedContent(user, {
      categoryId: target.categoryId,
      seriesId: target.type === "series" ? target.id : (target.seriesId ?? null),
    }),
  ]);
  return shareLinkPolicy({ canShareRestricted, targetIsRestricted }).allowed;
}

const LINK_INCLUDE = {
  recipients: { select: { email: true }, orderBy: { email: "asc" } },
  series: { select: { title: true, slug: true } },
  video: { select: { title: true, slug: true } },
  createdBy: { select: { email: true, name: true, displayName: true } },
} as const;

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
}: {
  actor: User;
  target: ShareTarget;
  visibility: ShareVisibility;
  emails: string[];
  note?: string | null;
  expiresInDays?: number | null;
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

  const policy = shareLinkPolicy({ canShareRestricted, targetIsRestricted });
  if (!policy.allowed) throw NextResponse.json({ error: policy.reason }, { status: 403 });

  const link = await prisma.shareLink.create({
    data: {
      token: generateShareToken(),
      createdById: actor.id,
      seriesId: target.type === "series" ? row.id : null,
      videoId: target.type === "video" ? row.id : null,
      visibility,
      grantsAccess: policy.grantsAccess,
      note: note?.trim() || null,
      expiresAt: expiryFromDays(expiresInDays),
      ...(visibility === "EMAIL" ? { recipients: { create: emails.map((email) => ({ email })) } } : {}),
    },
    include: LINK_INCLUDE,
  });

  if (visibility === "EMAIL") await notifyRecipients(link, actor, row.title);
  return link;
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
): Promise<void> {
  const emails = link.recipients.map((r) => r.email);
  if (emails.length === 0) return;

  const sharer = getDisplayName(actor);
  const subject = `${sharer} shared “${targetTitle}” with you`;
  const body = `${sharer} shared “${targetTitle}” with you. Open the link below to watch it.`;
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
  return prisma.shareLink.findMany({
    where: {
      ...(filter.createdById ? { createdById: filter.createdById } : {}),
      ...(filter.seriesId ? { seriesId: filter.seriesId } : {}),
      ...(filter.videoId ? { videoId: filter.videoId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: LINK_INCLUDE,
  });
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
