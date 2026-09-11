import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { canLead, standingIn } from "@/lib/groups";
import { viewerFor } from "@/lib/groups-query";
import { canKeepRoll, quietlyMissing, summariseRoll, visibleAttendance } from "@/lib/attendance";
import { meetingsFor, myAttendance, openMeeting, recordRoll, rollHistory } from "@/lib/attendance-query";
import { isPluginEnabled } from "@/lib/plugins";

/**
 * A group's meetings, and who came.
 *
 * The gate is leadership of *this* group, decided by the same function the
 * group page uses — the person who hosts the Tuesday group should not need a
 * capability grant to write down who turned up at their own house.
 *
 * A member asking gets their own attendance and nothing else. That is not a
 * 403: their own record is theirs to see, and refusing it outright would make
 * the ordinary case look like a permissions bug.
 */
export const dynamic = "force-dynamic";

const meetingSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Give a date as YYYY-MM-DD"),
  topic: z.string().trim().max(300).nullish(),
  visitorCount: z.number().int().min(0).max(500).optional(),
  cancelled: z.boolean().optional(),
  leaderNotes: z.string().max(4000).nullish(),
  roll: z
    .array(
      z.object({
        userId: z.string().min(1).max(60),
        status: z.enum(["PRESENT", "APOLOGIES", "ABSENT"]),
        note: z.string().max(300).nullish(),
      }),
    )
    .max(200)
    .optional(),
});

async function groupFor(slug: string) {
  return prisma.smallGroup.findUnique({
    where: { slug },
    include: { members: { select: { userId: true, role: true, status: true } } },
  });
}

export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    if (!(await isPluginEnabled("groups"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { slug } = await context.params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 403 });

    const group = await groupFor(slug);
    if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const viewer = await viewerFor(user);
    const standing = standingIn(group.members, viewer);

    if (!canKeepRoll(standing, viewer)) {
      // Their own evenings, which is the whole of what they may have.
      return NextResponse.json({ mine: await myAttendance(group.id, user.id), meetings: null });
    }

    const meetings = await meetingsFor(group.id);
    const active = group.members.filter((m) => m.status === "ACTIVE").map((m) => m.userId);
    return NextResponse.json({
      meetings: meetings.map((meeting) => ({
        ...meeting,
        attendance: visibleAttendance(meeting.attendance, standing, viewer),
        summary: summariseRoll(meeting.attendance, meeting.visitorCount),
      })),
      quiet: quietlyMissing(await rollHistory(group.id), active),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    if (!(await isPluginEnabled("groups"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { slug } = await context.params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 403 });

    const group = await groupFor(slug);
    if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const viewer = await viewerFor(user);
    if (!canLead(standingIn(group.members, viewer), viewer)) {
      // 404 rather than 403: whether this group keeps a roll is not something
      // somebody outside it needs confirmed.
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = meetingSchema.parse(await request.json());
    const meeting = await openMeeting(group.id, body.date, body, user.email);
    const recorded = body.roll ? await recordRoll(meeting.id, body.roll) : 0;

    return NextResponse.json({ meeting: { ...meeting, date: body.date }, recorded });
  } catch (error) {
    return errorResponse(error);
  }
}
