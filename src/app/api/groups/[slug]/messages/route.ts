import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/current-user";
import { isPluginEnabled } from "@/lib/plugins";
import { rateLimitResponse, windowStart } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import { standingIn } from "@/lib/groups";
import { viewerFor } from "@/lib/groups-query";
import {
  canModerate,
  MAX_LENGTH,
  POST_LIMIT,
  POST_WINDOW_SECONDS,
  threadMessage,
  threadState,
  visibleThread,
} from "@/lib/group-messages";
import {
  isMuted,
  messagesSince,
  postMessage,
  recentMessages,
  setMuted,
  threadGroup,
} from "@/lib/group-messages-query";

/**
 * A small group's conversation.
 *
 * Only people in the group get anything. Somebody outside it gets a 404 rather
 * than a 403, because whether a group has a thread going — and how busy it is
 * — is itself part of what the thread is private about.
 *
 * Note the viewer here is built *without* the site-wide manage capability
 * mattering: `threadState` turns on being in the group, and running the
 * website is not a reason to read one.
 */
export const dynamic = "force-dynamic";

const postSchema = z.object({ body: z.string().max(MAX_LENGTH * 2) });
const muteSchema = z.object({ muted: z.boolean() });

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    if (!(await isPluginEnabled("groups"))) return notFound();
    const { slug } = await context.params;
    const user = await getCurrentUser();
    const group = await threadGroup(slug);
    if (!group) return notFound();

    const viewer = await viewerFor(user);
    const standing = standingIn(group.members, viewer);
    const state = threadState(standing, viewer);
    if (state !== "open") {
      // 200 with a reason, not a 404: the group page itself is public, and the
      // thread panel on it needs a sentence to show rather than a broken box.
      return NextResponse.json({ messages: [], state, reason: threadMessage(state) });
    }

    const since = new URL(request.url).searchParams.get("since");
    const rows = since ? await messagesSince(group.id, since) : await recentMessages(group.id);

    return NextResponse.json({
      messages: visibleThread(rows, standing, viewer),
      state,
      reason: "",
      canModerate: canModerate(standing, viewer),
      muted: isMuted(group.members, viewer.userId),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    if (!(await isPluginEnabled("groups"))) return notFound();
    const { slug } = await context.params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 403 });

    const group = await threadGroup(slug);
    if (!group) return notFound();

    const limited = await rateLimitResponse(
      () =>
        prisma.groupMessage.count({
          where: {
            groupId: group.id,
            userId: user.id,
            createdAt: { gte: windowStart(POST_WINDOW_SECONDS) },
          },
        }),
      POST_LIMIT,
    );
    if (limited) return limited;

    // postMessage re-checks membership itself; that check is the gate, not this
    // route, so a later caller can't skip it.
    const message = await postMessage(group, user, postSchema.parse(await request.json()).body);
    return NextResponse.json({ id: message.id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Muting the thread: still in the group, no longer notified. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    if (!(await isPluginEnabled("groups"))) return notFound();
    const { slug } = await context.params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 403 });

    const group = await threadGroup(slug);
    if (!group) return notFound();

    const { muted } = muteSchema.parse(await request.json());
    if (!(await setMuted(group.id, user.id, muted))) return notFound();
    return NextResponse.json({ muted });
  } catch (error) {
    return errorResponse(error);
  }
}
