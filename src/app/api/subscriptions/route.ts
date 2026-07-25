import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { isPluginEnabled } from "@/lib/plugins";

const schema = z.object({
  type: z.enum(["series", "category"]),
  id: z.string().min(1),
});

/** Toggles a logged-in user's subscription to a series or category, returning the new state. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { type, id } = schema.parse(await request.json());

  if (type === "series") {
    const series = await prisma.series.findUnique({ where: { id }, select: { categoryId: true } });
    if (!series) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await isPluginEnabled("subscriptions", series.categoryId))) {
      return NextResponse.json({ error: "Subscriptions are disabled here" }, { status: 403 });
    }
    const existing = await prisma.subscription.findUnique({
      where: { userId_seriesId: { userId: user.id, seriesId: id } },
    });
    if (existing) {
      await prisma.subscription.delete({ where: { id: existing.id } });
      return NextResponse.json({ subscribed: false });
    }
    await prisma.subscription.create({ data: { userId: user.id, seriesId: id } });
    return NextResponse.json({ subscribed: true });
  }

  const category = await prisma.category.findUnique({ where: { id }, select: { id: true } });
  if (!category) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isPluginEnabled("subscriptions", id))) {
    return NextResponse.json({ error: "Subscriptions are disabled here" }, { status: 403 });
  }
  const existing = await prisma.subscription.findUnique({
    where: { userId_categoryId: { userId: user.id, categoryId: id } },
  });
  if (existing) {
    await prisma.subscription.delete({ where: { id: existing.id } });
    return NextResponse.json({ subscribed: false });
  }
  await prisma.subscription.create({ data: { userId: user.id, categoryId: id } });
  return NextResponse.json({ subscribed: true });
}
