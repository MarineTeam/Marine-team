import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

const schema = z.object({ endpoint: z.string().max(2048) });

/** Scoped to the member's own rows: an endpoint is unguessable, but the query says so anyway. */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { endpoint } = schema.parse(await request.json());
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
