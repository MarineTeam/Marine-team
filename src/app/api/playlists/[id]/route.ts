import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  public: z.boolean().optional(),
});

async function ensureOwned(id: string, userId: string) {
  const playlist = await prisma.playlist.findUnique({ where: { id } });
  if (!playlist || playlist.userId !== userId) return null;
  return playlist;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const playlist = await prisma.playlist.findFirst({
    where: { id, userId: user.id },
    include: { items: { orderBy: { position: "asc" }, include: { video: { include: { series: true } } } } },
  });
  if (!playlist) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(playlist);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!(await ensureOwned(id, user.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = patchSchema.parse(await request.json());
  const playlist = await prisma.playlist.update({ where: { id }, data: body });
  return NextResponse.json(playlist);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!(await ensureOwned(id, user.id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.playlist.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
