/**
 * Deciding which member an incoming Auth0 identity belongs to.
 *
 * Two identifiers arrive with every login and they are not equally
 * trustworthy:
 *
 * - `sub` is issued by Auth0, is globally unique, and never changes — not
 *   even when the person changes their email at the provider.
 * - `email` is a claim about the person that a provider may or may not have
 *   checked, and which can be reused, changed, or (on some connections)
 *   simply typed in.
 *
 * So sub wins whenever it's known. Email is only used to *discover* a link
 * for an identity that's never been seen before, and only when the provider
 * says it verified it — attaching an unverified email to an existing member
 * is the classic account-takeover path for email-based linking, and would
 * hand over that member's history and their role along with it.
 */

export type IncomingIdentity = {
  sub: string;
  email: string;
  emailVerified: boolean;
};

/** What the caller knows about existing rows, looked up before deciding. */
export type LinkingContext = {
  /** The user this exact sub already belongs to, if it's been seen before. */
  userIdBySub: string | null;
  /** The user holding this email address, if any. */
  userIdByEmail: string | null;
};

export type LinkingDecision =
  /** Known identity: use its user, and refresh the email on it if the provider changed it. */
  | { action: "existing"; userId: string }
  /** New identity, verified email matching an existing member: attach it to them. */
  | { action: "link"; userId: string }
  /** No safe match: this login gets a member row of its own. */
  | { action: "create" }
  /**
   * A new, unverified identity claiming an email that already belongs to
   * someone. Refused rather than linked or silently given a second account —
   * either would be a way to take over, or to shadow, an existing member.
   */
  | { action: "refuse"; reason: "unverified_email_collision" };

export function decideLinking(identity: IncomingIdentity, context: LinkingContext): LinkingDecision {
  // Seen before: sub is authoritative, so this is that member regardless of
  // what email the provider is sending today. This is the branch that makes
  // an email change at the provider a rename rather than a new account.
  if (context.userIdBySub) return { action: "existing", userId: context.userIdBySub };

  // Never seen this identity before.
  if (context.userIdByEmail) {
    if (!identity.emailVerified) return { action: "refuse", reason: "unverified_email_collision" };
    return { action: "link", userId: context.userIdByEmail };
  }

  return { action: "create" };
}
