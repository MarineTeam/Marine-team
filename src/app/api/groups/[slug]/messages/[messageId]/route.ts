import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { getCurrentUser } from "@/lib/current-user";
import { isPluginEnabled } from "@/lib/plugins";
import { viewerFor } from "@/lib/groups-query";
import { removeMessage, threadGroup } from "@/lib/group-messages-query";

/**
 * Taking one message down.
 *
 * The author's own, or any of them if you lead this group. Everything that
 * isn't allowed answers 404 with the same sentence, including a message id
 * from a different group's thread — the reply must not tell somebody which of
 * "it isn't there" and "it isn't yours" is true.
 */
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ slug: string; messageId: string }> },
) {
  try {
    if (!(await isPluginEnabled("groups"))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const { slug, messageId } = await context.params;
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 403 });

    const group = await threadGroup(slug);
    if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await removeMessage(group, messageId, await viewerFor(user));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
