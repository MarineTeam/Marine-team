import type { BroadcastAudience, BroadcastChannel, DeliveryStatus } from "@prisma/client";

/**
 * Bulk email and SMS: the parts that don't need a database.
 *
 * The rule underneath all of it is that **reach is never assumed**. A church
 * with 400 members does not have 400 email addresses it may write to and
 * certainly does not have 400 phone numbers it may text, and the difference
 * between those numbers is exactly what somebody needs to see *before* they
 * press send — otherwise "I told everyone" is false and nobody finds out until
 * a family turns up to a cancelled service.
 *
 * So every audience is resolved into an explicit per-person, per-channel list
 * with a reason attached to each one that can't be reached, and the screen
 * shows the reasons.
 */

/** Why somebody isn't getting this on a given channel. */
export type SkipReason =
  | "no-email"
  | "no-phone"
  | "no-sms-consent"
  | "unsubscribed"
  | "no-push";

export const SKIP_LABELS: Record<SkipReason, string> = {
  "no-email": "no email address",
  "no-phone": "no mobile number",
  "no-sms-consent": "hasn't agreed to texts",
  unsubscribed: "turned off announcement emails",
  "no-push": "no device signed up for notifications",
};

/** One person as the audience resolver found them. */
export type Candidate = {
  userId: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  smsOptIn: boolean;
  broadcastEmails: boolean;
  hasPushDevice: boolean;
};

export type Reachable = {
  userId: string | null;
  name: string | null;
  channel: BroadcastChannel;
  address: string;
};

export type Unreachable = { name: string | null; channel: BroadcastChannel; reason: SkipReason };

export type Plan = {
  reachable: Reachable[];
  unreachable: Unreachable[];
  /** Distinct people the message will reach on at least one channel. */
  peopleReached: number;
  /** Distinct people in the audience who will get nothing at all. */
  peopleMissed: number;
  perChannel: Record<string, number>;
};

/**
 * Turns an audience into who actually gets what.
 *
 * Consent is checked here rather than at the point of sending, so the count on
 * the screen is the count that goes out. Three separate rules, and they are
 * deliberately not the same rule:
 *
 *   - **Email**: on unless they turned announcements off. It is the channel
 *     they joined expecting, and the one that carries "the road is closed".
 *   - **SMS**: off unless they said yes. A text costs the church money and the
 *     recipient their attention, and sending one uninvited is illegal in most
 *     places.
 *   - **Push**: only to somebody with a device signed up, which is a fact
 *     rather than a preference.
 */
export function planDelivery(
  candidates: readonly Candidate[],
  channels: readonly BroadcastChannel[],
  normalizePhoneNumber: (raw: string | null) => string | null,
): Plan {
  const reachable: Reachable[] = [];
  const unreachable: Unreachable[] = [];
  const reached = new Set<string>();
  const everyone = new Set<string>();

  // Somebody may appear twice — signed up to the event *and* in the small
  // group — and must not be written to twice.
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const key = candidate.userId ?? `email:${(candidate.email ?? "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    everyone.add(key);

    for (const channel of channels) {
      if (channel === "EMAIL") {
        if (!candidate.email) unreachable.push({ name: candidate.name, channel, reason: "no-email" });
        else if (!candidate.broadcastEmails) {
          unreachable.push({ name: candidate.name, channel, reason: "unsubscribed" });
        } else {
          reachable.push({ userId: candidate.userId, name: candidate.name, channel, address: candidate.email });
          reached.add(key);
        }
        continue;
      }

      if (channel === "SMS") {
        const number = normalizePhoneNumber(candidate.phone);
        if (!candidate.smsOptIn) {
          unreachable.push({ name: candidate.name, channel, reason: "no-sms-consent" });
        } else if (!number) {
          unreachable.push({ name: candidate.name, channel, reason: "no-phone" });
        } else {
          reachable.push({ userId: candidate.userId, name: candidate.name, channel, address: number });
          reached.add(key);
        }
        continue;
      }

      // PUSH goes to an account, never to an address.
      if (!candidate.userId || !candidate.hasPushDevice) {
        unreachable.push({ name: candidate.name, channel, reason: "no-push" });
      } else {
        reachable.push({ userId: candidate.userId, name: candidate.name, channel, address: candidate.userId });
        reached.add(key);
      }
    }
  }

  const perChannel: Record<string, number> = {};
  for (const entry of reachable) {
    perChannel[entry.channel] = (perChannel[entry.channel] ?? 0) + 1;
  }

  return {
    reachable,
    unreachable,
    peopleReached: reached.size,
    peopleMissed: everyone.size - reached.size,
    perChannel,
  };
}

/** How the reasons read under the count: "12 no mobile number, 3 unsubscribed". */
export function summariseSkips(unreachable: readonly Unreachable[]): string {
  const counts = new Map<SkipReason, number>();
  for (const entry of unreachable) counts.set(entry.reason, (counts.get(entry.reason) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `${count} ${SKIP_LABELS[reason]}`)
    .join(", ");
}

/** A one-line description of an audience, for the list of past broadcasts. */
export function audienceLabel(audience: BroadcastAudience, name: string | null): string {
  switch (audience) {
    case "EVERYONE":
      return "Everyone";
    case "PERMISSION_GROUP":
      return name ? `Group: ${name}` : "A group";
    case "EVENT":
      return name ? `Signed up to: ${name}` : "An event's sign-ups";
    case "SMALL_GROUP":
      return name ? `Small group: ${name}` : "A small group";
    case "TEAM":
      return name ? `Team: ${name}` : "A team";
  }
}

/** How far a send has got, for the progress bar and the resume decision. */
export function progressOf(counts: Record<DeliveryStatus, number>): {
  total: number;
  done: number;
  finished: boolean;
} {
  const total = counts.PENDING + counts.SENT + counts.FAILED + counts.SKIPPED;
  const done = counts.SENT + counts.FAILED + counts.SKIPPED;
  return { total, done, finished: counts.PENDING === 0 };
}
