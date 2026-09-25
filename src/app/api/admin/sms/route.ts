import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-guard";
import { logRead } from "@/lib/read-audit-query";
import { logAudit } from "@/lib/audit";
import { isPluginEnabled } from "@/lib/plugins";
import { inbox, markThreadRead, reply, requireInboxAccess } from "@/lib/sms-inbox-query";

/** The shared inbox: reading replies, and answering them. */
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read"), phone: z.string().min(1).max(40) }),
  z.object({
    action: z.literal("reply"),
    phone: z.string().min(1).max(40),
    body: z.string().trim().min(1).max(1000),
  }),
]);

export async function GET() {
  try {
    if (!(await isPluginEnabled("sms-inbox"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const reader = await requireInboxAccess();
    await logRead({ kind: "sms_thread", actorEmail: reader.email });
    return NextResponse.json({ threads: await inbox() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isPluginEnabled("sms-inbox"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const user = await requireInboxAccess();
    const body = schema.parse(await request.json());

    if (body.action === "read") {
      return NextResponse.json({ read: await markThreadRead(body.phone) });
    }

    const sent = await reply(body.phone, body.body, user.email);
    await logAudit(user.email, "create", "sms", sent.id, `replied to ${body.phone}`);
    return NextResponse.json(sent, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
