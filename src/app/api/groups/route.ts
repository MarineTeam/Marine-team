import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/current-user";
import { listGroups, viewerFor } from "@/lib/groups-query";
import { isPluginEnabled } from "@/lib/plugins";

export async function GET() {
  try {
    if (!(await isPluginEnabled("groups"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const viewer = await viewerFor(await getCurrentUser());
    return NextResponse.json({ groups: await listGroups(viewer) });
  } catch (error) {
    return errorResponse(error);
  }
}
