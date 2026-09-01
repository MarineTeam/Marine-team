import type { Broadcast, BroadcastAudience, BroadcastChannel } from "@prisma/client";
import { planDelivery, type Candidate, type Plan } from "@/lib/broadcast";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { getDisplayName } from "@/lib/profile";
import { sendDigestToUser } from "@/lib/push";
import { normalizePhone, SmsError } from "@/lib/sms";
import { sendSms, smsConfig } from "@/lib/sms-send";

/**
 * Resolving an audience, and working through it.
 *
 * The two halves are deliberately separate calls. Resolving writes a row per
 * person per channel with the address copied in; sending walks those rows in
 * bounded batches and marks each one as it goes. That is what makes a send
 * **resumable**: a serverless function killed part way through four hundred
 * emails has already recorded the hundred and eighty it managed, and the next
 * call starts at a hundred and eighty-one rather than emailing everybody
 * again.
 *
 * It is also why the address is copied rather than read back through the user:
 * somebody who changes their number between composing and sending should not
 * have half a broadcast go to the old one.
 */

const userFields = {
  id: true,
  name: true,
  displayName: true,
  email: true,
  phone: true,
  smsOptIn: true,
  broadcastEmails: true,
} as const;

/** Everyone in the audience, whether or not they can be reached. */
export async function resolveAudience(
  audience: BroadcastAudience,
  audienceId: string | null,
): Promise<Candidate[]> {
  const withPush = new Set(
    (await prisma.pushSubscription.findMany({ select: { userId: true }, distinct: ["userId"] })).map(
      (row) => row.userId,
    ),
  );

  const fromUsers = (
    users: { id: string; name: string | null; displayName: string | null; email: string; phone: string | null; smsOptIn: boolean; broadcastEmails: boolean }[],
  ): Candidate[] =>
    users.map((user) => ({
      userId: user.id,
      name: getDisplayName(user),
      email: user.email,
      phone: user.phone,
      smsOptIn: user.smsOptIn,
      broadcastEmails: user.broadcastEmails,
      hasPushDevice: withPush.has(user.id),
    }));

  switch (audience) {
    case "EVERYONE":
      return fromUsers(await prisma.user.findMany({ where: { authorized: true }, select: userFields }));

    case "PERMISSION_GROUP": {
      if (!audienceId) return [];
      const rows = await prisma.groupAssignment.findMany({
        where: { groupId: audienceId },
        select: { user: { select: userFields } },
      });
      return fromUsers(rows.map((row) => row.user));
    }

    case "SMALL_GROUP": {
      if (!audienceId) return [];
      const rows = await prisma.smallGroupMember.findMany({
        where: { groupId: audienceId, status: "ACTIVE" },
        select: { user: { select: userFields } },
      });
      return fromUsers(rows.map((row) => row.user));
    }

    case "TEAM": {
      if (!audienceId) return [];
      const rows = await prisma.serviceTeamMember.findMany({
        where: { teamId: audienceId },
        select: { user: { select: userFields } },
      });
      return fromUsers(rows.map((row) => row.user));
    }

    case "EVENT": {
      if (!audienceId) return [];
      const rows = await prisma.eventRegistration.findMany({
        where: { eventId: audienceId, status: { in: ["GOING", "WAITLIST"] } },
        include: { user: { select: userFields } },
      });
      // The point of this audience: most of an event's sign-ups have no
      // account at all, and the address they typed is the only way to them.
      return rows.map((row) => ({
        userId: row.userId,
        name: row.user ? getDisplayName(row.user) : row.name,
        email: row.user?.email ?? row.email,
        phone: row.user?.phone ?? row.phone,
        // A phone number typed into a public sign-up form is not consent to
        // be added to a texting list. Only an account can carry that.
        smsOptIn: row.user?.smsOptIn ?? false,
        broadcastEmails: row.user?.broadcastEmails ?? true,
        hasPushDevice: row.userId ? withPush.has(row.userId) : false,
      }));
    }
  }
}

/** What a send would do, without doing any of it. */
export async function previewBroadcast(
  audience: BroadcastAudience,
  audienceId: string | null,
  channels: readonly BroadcastChannel[],
): Promise<Plan> {
  return planDelivery(await resolveAudience(audience, audienceId), channels, (raw) =>
    normalizePhone(raw),
  );
}

/**
 * Freezes the audience into rows and marks the broadcast as sending.
 *
 * Idempotent: a second call on a broadcast already resolved does nothing, so a
 * double-clicked button can't double the list. The unique index on
 * (broadcast, channel, address) is the backstop.
 */
export async function materialise(broadcast: Broadcast): Promise<{ created: number }> {
  const existing = await prisma.broadcastRecipient.count({ where: { broadcastId: broadcast.id } });
  if (existing > 0) return { created: 0 };

  const plan = await previewBroadcast(broadcast.audience, broadcast.audienceId, broadcast.channels);
  await prisma.$transaction([
    prisma.broadcastRecipient.createMany({
      data: plan.reachable.map((entry) => ({
        broadcastId: broadcast.id,
        userId: entry.userId,
        channel: entry.channel,
        address: entry.address,
        name: entry.name,
      })),
      skipDuplicates: true,
    }),
    prisma.broadcast.update({
      where: { id: broadcast.id },
      data: { status: "SENDING" },
    }),
  ]);
  return { created: plan.reachable.length };
}

export type SendProgress = {
  attempted: number;
  sent: number;
  failed: number;
  remaining: number;
  finished: boolean;
};

/**
 * Sends the next batch.
 *
 * Bounded by count *and* by time. The count keeps a batch predictable; the
 * clock is what actually protects the run, because one unresponsive provider
 * can make ten sends take longer than fifty. Whatever is left stays PENDING
 * and the next call continues — from the admin screen's own loop, which gives
 * a progress bar, or from the daily cron for anything abandoned half-done.
 */
export async function sendNextBatch(
  broadcastId: string,
  options: { size?: number; budgetMs?: number } = {},
): Promise<SendProgress> {
  const size = options.size ?? 25;
  const budgetMs = options.budgetMs ?? 20_000;
  const started = Date.now();

  const broadcast = await prisma.broadcast.findUnique({ where: { id: broadcastId } });
  if (!broadcast) throw new Error("That broadcast no longer exists.");

  const batch = await prisma.broadcastRecipient.findMany({
    where: { broadcastId, status: "PENDING" },
    orderBy: { id: "asc" },
    take: size,
  });

  const sms = smsConfig();
  let sent = 0;
  let failed = 0;
  let attempted = 0;

  for (const recipient of batch) {
    if (Date.now() - started > budgetMs) break;
    attempted += 1;

    try {
      if (recipient.channel === "EMAIL") {
        await sendEmail(recipient.address, broadcast.subject, broadcast.body);
      } else if (recipient.channel === "SMS") {
        if (!sms) throw new SmsError("Texting isn't set up on this site.");
        // The subject leads the text so a message from a church reads like
        // one; a phone shows no subject line of its own.
        await sendSms(sms, recipient.address, `${broadcast.subject}\n\n${broadcast.body}`);
      } else {
        await sendDigestToUser(recipient.address, { title: broadcast.subject, body: broadcast.body });
      }

      await prisma.broadcastRecipient.update({
        where: { id: recipient.id },
        data: { status: "SENT", sentAt: new Date(), error: null },
      });
      sent += 1;
    } catch (error) {
      // One bad address must never stop the other three hundred.
      await prisma.broadcastRecipient.update({
        where: { id: recipient.id },
        data: {
          status: "FAILED",
          error: (error instanceof Error ? error.message : "Sending failed.").slice(0, 300),
        },
      });
      failed += 1;
    }
  }

  const remaining = await prisma.broadcastRecipient.count({
    where: { broadcastId, status: "PENDING" },
  });
  if (remaining === 0) {
    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { status: "SENT", sentAt: broadcast.sentAt ?? new Date() },
    });
  }

  return { attempted, sent, failed, remaining, finished: remaining === 0 };
}

/** Anything left half-sent, for the daily sweep. */
export async function unfinishedBroadcasts(): Promise<string[]> {
  const rows = await prisma.broadcast.findMany({
    where: { status: "SENDING" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

/**
 * The audiences there are to choose between.
 *
 * A lib function rather than four queries in the page: `Date.now()` can't be
 * called during a render (it makes the render depend on when it happened to
 * run), and the composer wants one shape rather than four lists.
 */
export async function audienceOptions() {
  const recently = new Date(Date.now() - 30 * 86_400_000);
  const [groups, events, smallGroups, teams] = await Promise.all([
    prisma.permissionGroup.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    // Recent and upcoming only: writing to the sign-ups of a men's breakfast
    // from two years ago is a mistake waiting to be made from a long list.
    prisma.event.findMany({
      where: { startsAt: { gte: recently } },
      select: { id: true, title: true },
      orderBy: { startsAt: "desc" },
    }),
    prisma.smallGroup.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.serviceTeam.findMany({ select: { id: true, name: true }, orderBy: { position: "asc" } }),
  ]);
  return { groups, events, smallGroups, teams };
}
