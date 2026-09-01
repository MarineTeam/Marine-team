import { cache } from "react";
import { prisma } from "@/lib/db";
import { categoryChainIds } from "@/lib/content";
import { isPluginEnabled } from "@/lib/plugins";
import { isPlatformAllowed, type ClientPlatform } from "@/lib/download-platform";
import type { DownloadAudience, DownloadPlatform, User } from "@prisma/client";

// Re-exported so server callers have one import for the whole decision, even
// though the platform half has to live in a client-safe module.
export { isPlatformAllowed, type ClientPlatform };

/**
 * Who may download what, resolved from three independent questions:
 *
 *  1. Is the feature on at all?      — the Downloads plugin (site-wide, with
 *                                      the usual per-category override).
 *  2. May *this content* be downloaded? — the tri-state `downloadEnabled` on
 *                                      the video, its series, and its
 *                                      category chain (nearest wins).
 *  3. May *this person*, here?       — the DownloadPolicy's audience
 *                                      (everyone or named groups/people) and
 *                                      platform (web, installed app, or both).
 *
 * All three must pass, and none of them replaces the view check: a member who
 * can't watch something can never download it either, which the API enforces
 * by calling canViewVideo first.
 */

export type DownloadDenialReason =
  | "plugin_off"
  | "content_blocked"
  | "not_permitted"
  | "wrong_platform"
  | "not_logged_in"
  // Nothing is wrong: the video simply isn't ours to hand out. An imported
  // YouTube or Vimeo sermon has no file here, and offering a download that
  // could only ever fail is worse than saying where to watch it.
  | "not_hosted_here"
  // The four below are all "we couldn't get you a file", kept apart because
  // each has a different fix and only one of them is about the video itself.
  // Collapsing them into a single "no downloadable file" message is what made
  // a pull-zone security problem look like a missing upload.
  | "mp4_unavailable"
  | "resolution_unavailable"
  | "mp4_forbidden"
  | "mp4_missing"
  | "bunny_error";

export type DownloadAvailability =
  | { allowed: true; platform: DownloadPlatform }
  | { allowed: false; reason: DownloadDenialReason; message: string };

/** Copy for each denial, so the button, the API, and the profile page all say the same thing. */
export const DENIAL_MESSAGES: Record<DownloadDenialReason, string> = {
  plugin_off: "Downloads are turned off for this site.",
  content_blocked: "This video isn't available for download.",
  not_hosted_here: "This one plays from elsewhere, so there's no file to download.",
  not_permitted: "Your account doesn't have download access.",
  wrong_platform: "Downloads aren't available here — try the installed app.",
  not_logged_in: "Log in to download.",
  mp4_unavailable: "This video doesn't have a downloadable version yet.",
  resolution_unavailable: "No downloadable version of this video is available at a supported quality.",
  mp4_forbidden: "The download was refused by our video host. An administrator has been sent the details.",
  mp4_missing: "The downloadable file for this video is missing.",
  bunny_error: "We couldn't prepare the download just now. Please try again.",
};

function deny(reason: DownloadDenialReason): DownloadAvailability {
  return { allowed: false, reason, message: DENIAL_MESSAGES[reason] };
}

/**
 * The content half of the decision: the nearest explicit `downloadEnabled`
 * wins, walking video → series → category → ... → root, and nothing set
 * anywhere means "allowed" (the plugin being on is the site-level yes).
 *
 * Pure and separate from the queries that gather its inputs, since this
 * precedence is the part that's easy to get subtly wrong — it mirrors how
 * getPluginStates resolves a per-category override against its ancestors.
 */
export function resolveDownloadEnabled(chain: {
  video?: boolean | null;
  series?: boolean | null;
  /** The video's category and its ancestors, nearest first. */
  categories?: (boolean | null)[];
}): boolean {
  if (chain.video !== null && chain.video !== undefined) return chain.video;
  if (chain.series !== null && chain.series !== undefined) return chain.series;
  for (const category of chain.categories ?? []) {
    if (category !== null && category !== undefined) return category;
  }
  return true;
}

/** Whether this member is in the policy's audience. Pure; the group ids are fetched by the caller. */
export function isAudienceAllowed({
  audience,
  isAdmin,
  userGroupIds,
  allowedGroupIds,
  allowedUserIds,
  userId,
}: {
  audience: DownloadAudience;
  isAdmin: boolean;
  userGroupIds: string[];
  allowedGroupIds: string[];
  allowedUserIds: string[];
  userId: string;
}): boolean {
  if (isAdmin) return true;
  if (audience === "ALL_MEMBERS") return true;
  if (allowedUserIds.includes(userId)) return true;
  return userGroupIds.some((id) => allowedGroupIds.includes(id));
}

export type DownloadPolicyWithGrants = Awaited<ReturnType<typeof getDownloadPolicy>>;

/**
 * The site's single download policy row, created on first read the same way
 * plugin and home-row rows are seeded. Wrapped in React's `cache()` because a
 * video page asks for it and so does the button's own availability check.
 */
export const getDownloadPolicy = cache(async () => {
  return prisma.downloadPolicy.upsert({
    where: { id: "singleton" },
    create: {},
    update: {},
    include: {
      groups: { select: { groupId: true, group: { select: { name: true } } } },
      users: { select: { userId: true, user: { select: { email: true, name: true, displayName: true } } } },
    },
  });
});

/**
 * The whole decision for one video and one viewer, in the order that gives
 * the most useful message: feature, then content, then person, then platform,
 * so a member on the web is told "try the app" rather than "not available"
 * when the only problem is where they're standing.
 *
 * The mp4_* reasons aren't checked here — they need Bunny's metadata, so the
 * API does that last, once everything cheaper has passed.
 *
 * Pass `platform: "any"` to skip the platform check, which is what server
 * rendering has to do: whether the visitor is the installed app or a browser
 * tab is only visible client-side, so a page renders on everything else and
 * hands the answer (and the policy) to the button to finish deciding.
 */
export async function getDownloadAvailability({
  user,
  video,
  platform,
}: {
  user: User | null;
  video: {
    id: string;
    downloadEnabled: boolean | null;
    seriesId: string | null;
    categoryId: string | null;
    series?: { downloadEnabled: boolean | null; categoryId: string | null } | null;
    /** Absent for a video that lives somewhere else — see lib/video-source.ts. */
    bunnyVideoId?: string | null;
  };
  platform: ClientPlatform | "any";
}): Promise<DownloadAvailability> {
  if (!user) return deny("not_logged_in");

  // Checked before the permission questions on purpose: whether a file exists
  // to hand out has nothing to do with who is asking, and answering "you're
  // not allowed" about a video nobody could download would be a lie.
  if (video.bunnyVideoId === null) return deny("not_hosted_here");

  const categoryId = video.series?.categoryId ?? video.categoryId ?? null;
  const [pluginOn, policy] = await Promise.all([
    isPluginEnabled("downloads", categoryId),
    getDownloadPolicy(),
  ]);
  if (!pluginOn) return deny("plugin_off");

  const categoryChain = categoryId ? await categoryChainIds(categoryId) : [];
  const categoryFlags = categoryChain.length
    ? await prisma.category
        .findMany({ where: { id: { in: categoryChain } }, select: { id: true, downloadEnabled: true } })
        // categoryChainIds returns nearest-first; findMany doesn't preserve that.
        .then((rows) => {
          const byId = new Map(rows.map((r) => [r.id, r.downloadEnabled]));
          return categoryChain.map((id) => byId.get(id) ?? null);
        })
    : [];

  const contentAllowed = resolveDownloadEnabled({
    video: video.downloadEnabled,
    series: video.series?.downloadEnabled ?? null,
    categories: categoryFlags,
  });
  if (!contentAllowed) return deny("content_blocked");

  const userGroupIds =
    policy.audience === "SPECIFIC" && user.role !== "ADMIN"
      ? (
          await prisma.groupAssignment.findMany({
            where: { userId: user.id },
            select: { groupId: true },
          })
        ).map((a) => a.groupId)
      : [];

  const permitted = isAudienceAllowed({
    audience: policy.audience,
    isAdmin: user.role === "ADMIN",
    userGroupIds,
    allowedGroupIds: policy.groups.map((g) => g.groupId),
    allowedUserIds: policy.users.map((u) => u.userId),
    userId: user.id,
  });
  if (!permitted) return deny("not_permitted");

  if (platform !== "any" && !isPlatformAllowed(policy.platform, platform)) return deny("wrong_platform");

  return { allowed: true, platform: policy.platform };
}

/** Same denial shape, for the profile page's "can I download at all?" summary — no specific video. */
export async function getDownloadAccessSummary(user: User | null): Promise<{
  pluginOn: boolean;
  permitted: boolean;
  platform: DownloadPlatform;
  maxDeviceGb: number;
}> {
  const [pluginOn, policy] = await Promise.all([isPluginEnabled("downloads"), getDownloadPolicy()]);
  if (!user) return { pluginOn, permitted: false, platform: policy.platform, maxDeviceGb: policy.maxDeviceGb };

  const userGroupIds =
    policy.audience === "SPECIFIC" && user.role !== "ADMIN"
      ? (
          await prisma.groupAssignment.findMany({ where: { userId: user.id }, select: { groupId: true } })
        ).map((a) => a.groupId)
      : [];

  return {
    pluginOn,
    permitted: isAudienceAllowed({
      audience: policy.audience,
      isAdmin: user.role === "ADMIN",
      userGroupIds,
      allowedGroupIds: policy.groups.map((g) => g.groupId),
      allowedUserIds: policy.users.map((u) => u.userId),
      userId: user.id,
    }),
    platform: policy.platform,
    maxDeviceGb: policy.maxDeviceGb,
  };
}
