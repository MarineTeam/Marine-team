import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/current-user";
import { devicesFor } from "@/lib/tv-session";

/** The televisions this member has signed in. */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ devices: await devicesFor(user.id) });
  } catch (error) {
    return errorResponse(error);
  }
}
