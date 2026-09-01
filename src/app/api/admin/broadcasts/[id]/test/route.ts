import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { ensureCapability, ensureStaff } from "@/lib/permissions";
import { normalizePhone } from "@/lib/sms";
import { sendSms, smsConfig } from "@/lib/sms-send";

/**
 * Sends this message to whoever is composing it, and nobody else.
 *
 * The one thing that makes a typo in a message to four hundred people
 * survivable is having read it on a phone first.
 */
export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await ensureStaff();
    await ensureCapability(user, "manage_users");
    const { id } = await context.params;

    const broadcast = await prisma.broadcast.findUnique({ where: { id } });
    if (!broadcast) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const done: string[] = [];
    const problems: string[] = [];

    if (broadcast.channels.includes("EMAIL")) {
      await sendEmail(user.email, `[Test] ${broadcast.subject}`, broadcast.body);
      done.push(`email to ${user.email}`);
    }

    if (broadcast.channels.includes("SMS")) {
      const config = smsConfig();
      const number = normalizePhone(user.phone);
      if (!config) problems.push("Texting isn't set up on this site.");
      else if (!number) problems.push("You haven't given a mobile number in your own settings.");
      else {
        try {
          await sendSms(config, number, `[Test] ${broadcast.subject}\n\n${broadcast.body}`);
          done.push(`text to ${number}`);
        } catch (error) {
          problems.push(error instanceof Error ? error.message : "The text failed.");
        }
      }
    }

    return NextResponse.json({ done, problems });
  } catch (error) {
    return errorResponse(error);
  }
}
