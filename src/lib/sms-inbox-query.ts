import { Prisma, type User } from "@prisma/client";
import { ApiError } from "@/lib/api-guard";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { hasCapability } from "@/lib/permissions";
import { smsConfig, sendSms } from "@/lib/sms-send";
import { intoThreads, isOptIn, isOptOut, threadKey, type Incoming } from "@/lib/sms-inbox";

/**
 * The shared inbox for text replies.
 *
 * The rules are in `sms-inbox.ts`. Two things this file does that the rules
 * can't: it recognises the sender against the membership where it can (and
 * shrugs where it can't — the message still lands), and it acts on STOP
 * itself rather than leaving a legal instruction for a volunteer to notice.
 */

const messageSelect = {
  id: true,
  direction: true,
  phone: true,
  body: true,
  readAt: true,
  createdAt: true,
  userId: true,
  user: { select: { id: true, name: true, displayName: true } },
  person: { select: { id: true, displayName: true } },
} as const;

export async function requireInboxAccess(): Promise<User> {
  const user = await getCurrentUser();
  if (!user || !(await hasCapability(user, "manage_users"))) {
    throw new ApiError(404, "not_found", "Not found");
  }
  return user;
}

/**
 * Whose number this is, if anybody's.
 *
 * Matched on the normalised form so a number stored as `07700 900123` still
 * finds the person who replied from `+447700900123`. An unmatched message is
 * stored exactly the same way — the inbox is the point, not the matching.
 *
 * Both sides of that comparison have to be normalised under the same
 * assumptions, which is why nothing in this file passes a country in:
 * `normalizePhone` reads `SMS_DEFAULT_COUNTRY_CODE` itself, so the stored
 * number and the one the gateway delivered cannot disagree. An earlier
 * version took the country as an argument and applied it to the incoming
 * number only, which failed to recognise anybody whose number was written
 * down in national form — most people — and so filed STOP instead of acting
 * on it.
 */
async function whoseNumber(phone: string) {
  const users = await prisma.user.findMany({
    where: { phone: { not: null } },
    select: { id: true, phone: true, person: { select: { id: true } } },
  });
  const match = users.find((user) => threadKey(user.phone ?? "") === phone);
  return { userId: match?.id ?? null, personId: match?.person?.id ?? null };
}

/**
 * Files an inbound message.
 *
 * Idempotent on the provider's id: a gateway that retries must not put the
 * same reply in the inbox twice. A message with no provider id is stored
 * anyway — losing a reply is worse than filing one twice.
 */
export async function receive(incoming: Incoming) {
  const phone = threadKey(incoming.from);

  if (incoming.providerId) {
    const already = await prisma.smsMessage.findUnique({
      where: { providerId: incoming.providerId },
      select: { id: true },
    });
    if (already) return { stored: false, id: already.id, optOut: false };
  }

  const who = await whoseNumber(phone);

  // STOP is a legal instruction in most places this runs. Acting on it here,
  // rather than leaving it in a list for somebody to spot, is the difference
  // between a rule that is followed and one that is eventually not.
  let optOut = false;
  if (isOptOut(incoming.body) && who.userId) {
    await prisma.user.update({ where: { id: who.userId }, data: { smsOptIn: false } });
    optOut = true;
  } else if (isOptIn(incoming.body) && who.userId) {
    await prisma.user.update({ where: { id: who.userId }, data: { smsOptIn: true } });
  }

  try {
    const row = await prisma.smsMessage.create({
      data: {
        direction: "INBOUND",
        phone,
        body: incoming.body,
        providerId: incoming.providerId,
        userId: who.userId,
        personId: who.personId,
        createdAt: incoming.receivedAt,
      },
      select: { id: true },
    });
    return { stored: true, id: row.id, optOut };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && incoming.providerId) {
      const now = await prisma.smsMessage.findUnique({
        where: { providerId: incoming.providerId },
        select: { id: true },
      });
      if (now) return { stored: false, id: now.id, optOut };
    }
    throw error;
  }
}

/** The inbox, threaded, most recently active first. */
export async function inbox(take = 300) {
  const rows = await prisma.smsMessage.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: messageSelect,
  });
  return intoThreads(
    rows.map((row) => ({
      id: row.id,
      phone: row.phone,
      who: row.person?.displayName ?? row.user?.displayName ?? row.user?.name ?? null,
      direction: row.direction,
      body: row.body,
      createdAt: row.createdAt,
      readAt: row.readAt,
    })),
  );
}

/** Marks a thread read. */
export async function markThreadRead(phone: string): Promise<number> {
  const { count } = await prisma.smsMessage.updateMany({
    where: { phone, direction: "INBOUND", readAt: null },
    data: { readAt: new Date() },
  });
  return count;
}

/**
 * Replies in a thread.
 *
 * Sent through the same gateway as everything else, and recorded in the same
 * table, so the thread reads as a conversation rather than as an inbox with
 * the answers missing.
 */
export async function reply(phone: string, body: string, byEmail: string) {
  const text = body.trim();
  if (!text) throw new ApiError(400, "empty", "Write something first.");

  const who = await whoseNumber(phone);
  if (who.userId) {
    const user = await prisma.user.findUnique({ where: { id: who.userId }, select: { smsOptIn: true } });
    // Honouring STOP on the way out, not only on the way in. Asked before the
    // gateway is looked at, so the refusal says the true thing rather than
    // whichever obstacle happened to come first.
    if (user && !user.smsOptIn) {
      throw new ApiError(409, "opted_out", "They've asked not to be texted.");
    }
  }

  const config = smsConfig();
  if (!config) throw new ApiError(503, "not_configured", "Texting isn't set up on this deployment.");

  await sendSms(config, phone, text);
  return prisma.smsMessage.create({
    data: {
      direction: "OUTBOUND",
      phone,
      body: text,
      userId: who.userId,
      personId: who.personId,
      sentByEmail: byEmail,
    },
    select: { id: true },
  });
}

/** How many replies nobody has read, for a badge. */
export async function unreadCount(): Promise<number> {
  return prisma.smsMessage.count({ where: { direction: "INBOUND", readAt: null } });
}
