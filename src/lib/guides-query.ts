import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { uniqueSlug } from "@/lib/slug";
import { hasCapability } from "@/lib/permissions";
import type { GroupViewer, Standing } from "@/lib/groups";
import { canOpenGuide, describeGuide, presentGuide, type VisibleGuide } from "@/lib/guides";

/**
 * Reading discussion guides.
 *
 * A guide belongs to the church rather than to one group, so "are you a leader"
 * is asked of the whole person rather than of one membership: whoever is
 * leading *any* group is leading this material somewhere, and the leader notes
 * are written for them. That is the only sensible reading — a guide has no
 * group to be a leader of.
 */

const itemShape = { id: true, kind: true, body: true, reference: true, position: true } as const;

export type GuideViewer = GroupViewer & { standing: Standing };

/**
 * How this person stands in relation to *any* guide.
 *
 * `leader` when they lead a group or keep the group list, `none` otherwise.
 * Resolved once here rather than per guide, since the answer cannot differ
 * between two guides.
 */
export async function guideViewerFor(user: User | null): Promise<GuideViewer> {
  if (!user) return { userId: null, manages: false, standing: "none" };

  const [manages, leads] = await Promise.all([
    hasCapability(user, "manage_events"),
    prisma.smallGroupMember.count({
      where: { userId: user.id, role: "LEADER", status: "ACTIVE" },
    }),
  ]);

  return { userId: user.id, manages, standing: leads > 0 ? "leader" : "none" };
}

export async function getGuide(slug: string, viewer: GuideViewer): Promise<VisibleGuide | null> {
  const guide = await prisma.discussionGuide.findUnique({
    where: { slug },
    include: { items: { select: itemShape, orderBy: { position: "asc" } } },
  });
  if (!guide || !canOpenGuide(guide, viewer)) return null;
  return presentGuide(guide, guide.items, viewer.standing, viewer);
}

/** Every guide this person may open, newest first. */
export async function listGuides(viewer: GuideViewer) {
  const guides = await prisma.discussionGuide.findMany({
    where: viewer.manages ? {} : { published: true },
    orderBy: { updatedAt: "desc" },
    include: {
      items: { select: itemShape },
      series: { select: { title: true, slug: true } },
      video: { select: { title: true, slug: true } },
    },
  });

  return guides.map((guide) => ({
    slug: guide.slug,
    title: guide.title,
    description: guide.description,
    published: guide.published,
    // Counts questions, not items — see describeGuide.
    describes: describeGuide(guide.items),
    follows: guide.video
      ? { kind: "video" as const, title: guide.video.title, slug: guide.video.slug }
      : guide.series
        ? { kind: "series" as const, title: guide.series.title, slug: guide.series.slug }
        : null,
  }));
}

/**
 * Published guides written around one talk or its series, for a link under the
 * player. Drafts never appear here whoever is asking: this list is rendered on
 * a page anybody may open, and a draft's title is as much of a leak as its
 * body.
 */
export async function guidesForVideo(videoId: string, seriesId: string | null) {
  return prisma.discussionGuide.findMany({
    where: {
      published: true,
      OR: [{ videoId }, ...(seriesId ? [{ seriesId, videoId: null }] : [])],
    },
    orderBy: { updatedAt: "desc" },
    take: 4,
    select: { slug: true, title: true },
  });
}

export async function nextGuideSlug(title: string): Promise<string> {
  const taken = await prisma.discussionGuide.findMany({ select: { slug: true } });
  return uniqueSlug(
    title,
    taken.map((guide) => guide.slug),
    "guide",
  );
}
