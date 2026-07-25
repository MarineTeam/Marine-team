import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { isPluginEnabled } from "@/lib/plugins";
import { getUserPlaylists } from "@/lib/content";

const createSchema = z.object({ title: z.string().min(1).max(200) });

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getUserPlaylists(user.id));
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await isPluginEnabled("playlists"))) {
    return NextResponse.json({ error: "Playlists are disabled" }, { status: 403 });
  }
  const { title } = createSchema.parse(await request.json());
  const playlist = await prisma.playlist.create({ data: { userId: user.id, title } });
  return NextResponse.json(playlist, { status: 201 });
}
