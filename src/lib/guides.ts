import type { GuideItemKind } from "@prisma/client";
import { canLead, type GroupViewer, type Standing } from "@/lib/groups";

/**
 * Discussion guides: the questions a group works through after a sermon.
 *
 * One rule shapes this file, and it is the same shape as the small group's
 * address. **A leader note must never reach a member.** "Don't be surprised if
 * this one goes quiet — the Harrisons lost their son in March" is written to be
 * read by the person in the chair and by nobody else, and a guide printed to a
 * dozen phones is exactly where that kind of line leaks.
 *
 * So the rule is not a check a page performs. `VisibleGuide.items` is typed to
 * hold only the kinds everybody may read, and leader notes come back — when
 * they come back at all — in a **separate optional field**. A page that renders
 * the items cannot print a leader note by forgetting, because the items it was
 * handed never contained one.
 */

/** The kinds anybody in the group may read. */
export const MEMBER_KINDS = ["QUESTION", "SCRIPTURE", "NOTE"] as const;
export type MemberKind = (typeof MEMBER_KINDS)[number];

export function isMemberKind(kind: GuideItemKind): kind is MemberKind {
  return (MEMBER_KINDS as readonly string[]).includes(kind);
}

export type GuideItemRow = {
  id: string;
  kind: GuideItemKind;
  body: string;
  reference: string | null;
  position: number;
};

export type GuideRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  published: boolean;
  seriesId: string | null;
  videoId: string | null;
};

/** An item anybody in the group may read. Note the narrowed `kind`. */
export type VisibleGuideItem = {
  id: string;
  kind: MemberKind;
  body: string;
  reference: string | null;
  position: number;
};

/**
 * A guide as somebody is allowed to see it.
 *
 * `items` can only ever hold member-readable kinds — that is the type doing the
 * work. `leaderNotes` is absent, not empty, for anybody who may not have them,
 * so `"leaderNotes" in guide` is a true answer rather than a length check.
 */
export type VisibleGuide = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  items: VisibleGuideItem[];
  /** Present only for somebody leading the group. Absent, not empty, otherwise. */
  leaderNotes?: { id: string; body: string; reference: string | null }[];
};

/**
 * Whether this viewer gets the leader notes.
 *
 * Leading *this* group, or keeping the group list. Deliberately the same test
 * as `canKeepRoll`: the two things a leader is trusted with are the roll and
 * the notes, and they are trusted with them for the same reason.
 */
export function canSeeLeaderNotes(standing: Standing, viewer: GroupViewer): boolean {
  return canLead(standing, viewer);
}

/**
 * The one place a guide is turned into something renderable.
 *
 * Items are sorted here rather than trusted from the caller, so a guide always
 * reads in the order it was written whatever the query did.
 */
export function presentGuide(
  guide: GuideRow,
  items: readonly GuideItemRow[],
  standing: Standing,
  viewer: GroupViewer,
): VisibleGuide {
  const ordered = [...items].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));

  const visible: VisibleGuideItem[] = ordered
    .filter((item): item is GuideItemRow & { kind: MemberKind } => isMemberKind(item.kind))
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      body: item.body,
      reference: item.reference,
      position: item.position,
    }));

  const leaderNotes = ordered
    .filter((item) => item.kind === "LEADER_NOTE")
    .map((item) => ({ id: item.id, body: item.body, reference: item.reference }));

  return {
    id: guide.id,
    slug: guide.slug,
    title: guide.title,
    description: guide.description,
    items: visible,
    // Spread rather than assigned, so the field is absent for a member instead
    // of present-and-empty — the same trick the group address uses.
    ...(canSeeLeaderNotes(standing, viewer) && leaderNotes.length > 0 ? { leaderNotes } : {}),
  };
}

/**
 * Whether a guide may be opened at all.
 *
 * A draft is staff-only, so a link pasted into a group chat before anybody is
 * happy with it does not become the thing everybody reads.
 */
export function canOpenGuide(guide: Pick<GuideRow, "published">, viewer: GroupViewer): boolean {
  return guide.published || viewer.manages;
}

/**
 * How a guide is labelled in a list.
 *
 * Counts questions rather than items, because "9 items" includes the notes and
 * the leader's asides and answers a question nobody asked. A guide with no
 * questions is a handout, and says so.
 */
export function describeGuide(items: readonly GuideItemRow[]): string {
  const questions = items.filter((item) => item.kind === "QUESTION").length;
  if (questions === 0) return "Notes";
  return questions === 1 ? "1 question" : `${questions} questions`;
}
