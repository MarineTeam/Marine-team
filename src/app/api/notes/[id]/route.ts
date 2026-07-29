import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

const updateSchema = z.object({
  timestampSeconds: z.number().int().min(0).optional(),
  body: z.string().trim().min(1).max(2000).optional(),
});

async function ensureOwnNote(userId: string, id: string) {
  const note = await prisma.sermonNote.findUnique({ where: { id } });
  return note && note.userId === userId ? note : null;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (!(await ensureOwnNote(user.id, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = updateSchema.parse(await request.json());
  const note = await prisma.sermonNote.update({ where: { id }, data: body });
  return NextResponse.json(note);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (!(await ensureOwnNote(user.id, id))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.sermonNote.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
