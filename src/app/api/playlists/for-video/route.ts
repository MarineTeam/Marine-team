import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { getUserPlaylistsWithMembership } from "@/lib/content";

/** Every playlist the user has, flagged with whether the given video is already in it — for an "Add to playlist" menu. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const videoId = new URL(request.url).searchParams.get("videoId");
  if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });
  return NextResponse.json(await getUserPlaylistsWithMembership(user.id, videoId));
}
