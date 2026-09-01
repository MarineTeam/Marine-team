import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { chatState, cleanMessage, visibleMessages, waitSeconds } from "@/lib/live-chat";
import { hasCapability } from "@/lib/permissions";
import { isPluginEnabled } from "@/lib/plugins";
import { getDisplayName } from "@/lib/profile";
import { rateLimitResponse, windowStart } from "@/lib/rate-limit";

/**
 * Reading and writing the chat beside a stream.
 *
 * Polling, not sockets: this app runs on serverless functions with no
 * long-lived process to hold a connection open. `?since=<id>` is one indexed
 * range scan, which is what makes asking every few seconds affordable.
 */

const MAX_PAGE = 100;
/** Flood protection, separate from slow mode: this is per person per minute. */
const MAX_PER_MINUTE = 12;

const postSchema = z.object({ body: z.string().max(2000) });

async function load(streamId: string) {
  const stream = await prisma.liveStream.findUnique({ where: { id: streamId } });
  const user = await getCurrentUser();
  const moderates = user ? await hasCapability(user, "moderate_comments") : false;
  return { stream, user, viewer: { userId: user?.id ?? null, moderates } };
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isPluginEnabled("live-streaming"))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const { id } = await context.params;
    const { stream, viewer } = await load(id);
    if (!stream || !stream.published) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const since = new URL(request.url).searchParams.get("since");
    const rows = await prisma.liveChatMessage.findMany({
      where: { streamId: id, ...(since ? { id: { gt: since } } : {}) },
      orderBy: { id: "asc" },
      // A tab left open all afternoon asks with an id from an hour ago; the
      // cap is what stops that one answer being the whole evening.
      take: MAX_PAGE,
    });

    return NextResponse.json({
      messages: visibleMessages(rows, viewer),
      state: chatState(stream),
      slowMode: stream.chatSlowMode,
      canModerate: viewer.moderates,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!(await isPluginEnabled("live-streaming"))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const { id } = await context.params;
    const { stream, user } = await load(id);
    if (!stream || !stream.published) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!user) return NextResponse.json({ error: "Sign in to join the chat." }, { status: 403 });

    const state = chatState(stream);
    if (state !== "open") {
      return NextResponse.json(
        { error: state === "not-yet" ? "The chat isn't open yet." : "The chat has closed." },
        { status: 409 },
      );
    }

    // Muted is per stream: silencing somebody for one evening is the
    // proportionate act, and a site-wide ban is a different decision.
    const muted = await prisma.liveChatMute.findUnique({
      where: { streamId_userId: { streamId: id, userId: user.id } },
    });
    if (muted) {
      return NextResponse.json({ error: "You can't post in this chat." }, { status: 403 });
    }

    const limited = await rateLimitResponse(
      () =>
        prisma.liveChatMessage.count({
          where: { streamId: id, userId: user.id, createdAt: { gte: windowStart(60) } },
        }),
      MAX_PER_MINUTE,
    );
    if (limited) return limited;

    if (stream.chatSlowMode > 0) {
      const last = await prisma.liveChatMessage.findFirst({
        where: { streamId: id, userId: user.id },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      const wait = waitSeconds(last?.createdAt ?? null, stream.chatSlowMode);
      if (wait > 0) {
        return NextResponse.json(
          { error: `Slow mode — ${wait} more ${wait === 1 ? "second" : "seconds"}.`, wait },
          { status: 429 },
        );
      }
    }

    const cleaned = cleanMessage(postSchema.parse(await request.json()).body);
    if (!cleaned.ok) return NextResponse.json({ error: cleaned.reason }, { status: 400 });

    const message = await prisma.liveChatMessage.create({
      data: {
        streamId: id,
        userId: user.id,
        // Copied at write time: a later change of display name shouldn't
        // rewrite what a conversation looked like.
        authorName: getDisplayName(user),
        body: cleaned.body,
      },
    });
    return NextResponse.json({ id: message.id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
