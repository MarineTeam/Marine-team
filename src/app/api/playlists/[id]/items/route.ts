import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { isPluginEnabled } from "@/lib/plugins";

async function ensureOwned(id: string, userId: string) {
  const playlist = await prisma.playlist.findUnique({ where: { id } });
  if (!playlist || playlist.userId !== userId) return null;
  return playlist;
}

const addSchema = z.object({ videoId: z.string().min(1) });
const removeSchema = z.object({ videoId: z.string().min(1) });
const reorderSchema = z.object({ itemIds: z.array(z.string().min(1)) });

/** Appends a video to the end of the playlist. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!(await ensureOwned(id, user.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isPluginEnabled("playlists"))) {
    return NextResponse.json({ error: "Playlists are disabled" }, { status: 403 });
  }

  const { videoId } = addSchema.parse(await request.json());
  const video = await prisma.video.findUnique({ where: { id: videoId } });
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  const count = await prisma.playlistItem.count({ where: { playlistId: id } });
  const item = await prisma.playlistItem
    .create({ data: { playlistId: id, videoId, position: count } })
    .catch(() => null);
  if (!item) return NextResponse.json({ error: "Already in playlist" }, { status: 409 });
  return NextResponse.json(item, { status: 201 });
}

/** Removes a video from the playlist. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!(await ensureOwned(id, user.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { videoId } = removeSchema.parse(await request.json());
  await prisma.playlistItem.deleteMany({ where: { playlistId: id, videoId } });
  return NextResponse.json({ ok: true });
}

/** Reorders the playlist's items by supplying the full list of item ids in the desired order. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!(await ensureOwned(id, user.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { itemIds } = reorderSchema.parse(await request.json());
  await Promise.all(
    itemIds.map((itemId, position) =>
      prisma.playlistItem.updateMany({ where: { id: itemId, playlistId: id }, data: { position } }),
    ),
  );
  return NextResponse.json({ ok: true });
}
