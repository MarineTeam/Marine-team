import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import type { AccessAttemptType, AccessDenialReason } from "@prisma/client";

/**
 * The application's authorization model, which is two independent checks that
 * must BOTH pass:
 *
 *   authenticated with Auth0
 *     -> member of the Marine Team Auth0 organization   (org_id on the ID token)
 *     -> email present and ACTIVE in AuthorizedEmail    (PostgreSQL)
 *     -> application access
 *
 * Neither is sufficient alone. The organization half is proved by the `org_id`
 * claim of the ID token the SDK has already verified — never by anything the
 * browser sends us — and the allowlist half is a database read, so removing an
 * email takes effect on the next request rather than whenever a token happens
 * to expire.
 */

/**
 * The one way an email is ever compared or stored. Every lookup, insert, and
 * claim check goes through this, so " Alice@Example.com " and
 * "alice@example.com" can't be different rows or different answers.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Rough shape check before an email reaches the database. Deliberately permissive — Auth0 has already verified deliverability for real signups; this is here to reject obvious junk and anything with control characters or newlines that could be used for header/log injection. */
export function isValidEmail(email: string): boolean {
  if (email.length === 0 || email.length > 254) return false;
  if (/[\s<>"'\\;,]/.test(email)) return false;
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(email);
}

/** The organization the ID token must name. Unset means the org check can't be satisfied — see requiredOrganizationId. */
export function requiredOrganizationId(): string | null {
  return process.env.AUTH0_ORGANIZATION_ID?.trim() || null;
}

/**
 * Whether the session's organization claim matches the configured one.
 *
 * Fails closed when `AUTH0_ORGANIZATION_ID` isn't set: a missing configuration
 * must not silently turn a required check into a no-op. The comparison is
 * against the claim from the verified ID token, never a query parameter or
 * header, so a browser can't assert membership it doesn't have.
 */
export function isOrganizationMember(orgIdFromToken: string | null | undefined): boolean {
  const required = requiredOrganizationId();
  if (!required) return false;
  return orgIdFromToken === required;
}

/** Whether this email is on the allowlist and active. Takes any casing; normalizes before the lookup. */
export async function isEmailAuthorized(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) return false;

  const row = await prisma.authorizedEmail.findUnique({
    where: { email: normalized },
    select: { status: true },
  });
  if (row) return row.status === "ACTIVE";

  return adoptBootstrapAdmin(normalized);
}

/**
 * Bootstrap for a brand-new deployment: an address in `ADMIN_EMAILS` with no
 * row yet gets a real `AuthorizedEmail` record created for it, rather than an
 * invisible permanent exception. Otherwise an empty allowlist would lock
 * everybody out of the very screen used to fill it in.
 *
 * This is a *source* for the allowlist, not a bypass of the model: a bootstrap
 * admin still has to be a member of the organization to get in, and once the
 * row exists an administrator can suspend or delete it like any other — which
 * is why an existing SUSPENDED row above is never revived here.
 */
async function adoptBootstrapAdmin(normalizedEmail: string): Promise<boolean> {
  const bootstrapEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => normalizeEmail(e));
  if (!bootstrapEmails.includes(normalizedEmail)) return false;

  await prisma.authorizedEmail.upsert({
    where: { email: normalizedEmail },
    create: { email: normalizedEmail, note: "Added automatically from ADMIN_EMAILS" },
    update: {},
  });
  return true;
}

export type AuthorizationResult =
  | { allowed: true; organizationMember: true; emailAuthorized: true }
  | {
      allowed: false;
      organizationMember: boolean;
      emailAuthorized: boolean;
      reason: AccessDenialReason;
    };

/** Which denial to record, given which halves failed — kept pure so the truth table is testable. */
export function denialReasonFor(organizationMember: boolean, emailAuthorized: boolean): AccessDenialReason {
  if (!organizationMember && !emailAuthorized) return "NOT_ORG_MEMBER_AND_EMAIL_NOT_AUTHORIZED";
  if (!organizationMember) return "NOT_ORG_MEMBER";
  return "EMAIL_NOT_AUTHORIZED";
}

/**
 * The whole decision for one identity. Both halves are always evaluated (not
 * short-circuited) so the recorded attempt says which of them failed, which is
 * what an administrator needs to know to fix it.
 */
export async function authorizeIdentity(identity: {
  email: string | null | undefined;
  orgId: string | null | undefined;
}): Promise<AuthorizationResult> {
  const organizationMember = isOrganizationMember(identity.orgId);
  const emailAuthorized = await isEmailAuthorized(identity.email);

  if (organizationMember && emailAuthorized) {
    return { allowed: true, organizationMember: true, emailAuthorized: true };
  }
  return {
    allowed: false,
    organizationMember,
    emailAuthorized,
    reason: denialReasonFor(organizationMember, emailAuthorized),
  };
}

/** Strips anything that could break out of a log line or an email header. */
function sanitizeForRecord(value: string | null | undefined, maxLength: number): string | null {
  if (!value) return null;
  return value.replace(/[\r\n\u0000-\u001f]/g, " ").trim().slice(0, maxLength) || null;
}

/**
 * Records a refused attempt and, subject to the cooldown below, tells the
 * administrators.
 *
 * Stores no credential material of any kind — no tokens, authorization codes,
 * or passwords — only who was refused and why. Everything written here is
 * sanitized first: the user agent and email arrive from a request, and a
 * newline in either would otherwise be able to forge a line in a log or a
 * header in the notification email.
 *
 * Never throws: this runs on the failure path of authentication, and a
 * database hiccup while recording an attempt must not turn a clean "access
 * denied" into a 500.
 */
export async function recordAccessAttempt(attempt: {
  email?: string | null;
  auth0UserId?: string | null;
  provider?: string | null;
  attemptType: AccessAttemptType;
  organizationMember: boolean;
  emailAuthorized: boolean;
  reason: AccessDenialReason;
  ipAddress?: string | null;
  userAgent?: string | null;
  /**
   * Skip writing a row if the same email hit the same wall this recently.
   * Used for SESSION denials, which would otherwise write once per request
   * for as long as a revoked user leaves a tab open.
   */
  dedupeMinutes?: number;
}): Promise<void> {
  try {
    const email = attempt.email ? normalizeEmail(attempt.email) : null;

    if (attempt.dedupeMinutes && email) {
      const since = new Date(Date.now() - attempt.dedupeMinutes * 60 * 1000);
      const recent = await prisma.unauthorizedAccessAttempt.count({
        where: { email, attemptType: attempt.attemptType, reason: attempt.reason, createdAt: { gte: since } },
      });
      if (recent > 0) return;
    }

    const row = await prisma.unauthorizedAccessAttempt.create({
      data: {
        email: sanitizeForRecord(email, 254),
        auth0UserId: sanitizeForRecord(attempt.auth0UserId, 128),
        provider: sanitizeForRecord(attempt.provider, 64),
        attemptType: attempt.attemptType,
        organizationMember: attempt.organizationMember,
        emailAuthorized: attempt.emailAuthorized,
        reason: attempt.reason,
        ipAddress: sanitizeForRecord(attempt.ipAddress, 64),
        userAgent: sanitizeForRecord(attempt.userAgent, 256),
      },
      select: { id: true, email: true, provider: true, attemptType: true, reason: true, createdAt: true },
    });
    await maybeNotifyAdmins(row);
  } catch (error) {
    // Logged, not surfaced: the caller is already returning a denial.
    console.error("Failed to record access attempt:", error);
  }
}

/** How long the same email is left alone after an administrator has been told about it. */
const NOTIFY_COOLDOWN_MINUTES = 60;

/** Ceiling on notification emails per hour across all attempts, so a scripted attack can't flood an inbox. */
const NOTIFY_MAX_PER_HOUR = 10;

/**
 * Emails the administrators about a refused attempt, unless it would be noise.
 *
 * Two brakes, both counted in Postgres (this app runs on serverless functions
 * with no shared memory — the same reasoning as src/lib/rate-limit.ts, and the
 * reason no Redis is involved):
 *
 *  - **Deduplication/cooldown**: the same email is only reported once an hour,
 *    so someone repeatedly clicking "log in" produces one email, not thirty.
 *  - **A global hourly ceiling**: with many different addresses being tried,
 *    the flood stops at ten notifications and the rest are still recorded for
 *    the admin page. The attempt itself is *always* stored; only the emailing
 *    is throttled.
 */
async function maybeNotifyAdmins(attempt: {
  id: string;
  email: string | null;
  provider: string | null;
  attemptType: AccessAttemptType;
  reason: AccessDenialReason;
  createdAt: Date;
}): Promise<void> {
  const cooldownStart = new Date(Date.now() - NOTIFY_COOLDOWN_MINUTES * 60 * 1000);
  const hourStart = new Date(Date.now() - 60 * 60 * 1000);

  const [recentForEmail, sentThisHour] = await Promise.all([
    attempt.email
      ? prisma.unauthorizedAccessAttempt.count({
          where: { email: attempt.email, notifiedAt: { gte: cooldownStart }, id: { not: attempt.id } },
        })
      : Promise.resolve(0),
    prisma.unauthorizedAccessAttempt.count({ where: { notifiedAt: { gte: hourStart } } }),
  ]);
  if (recentForEmail > 0 || sentThisHour >= NOTIFY_MAX_PER_HOUR) return;

  const recipients = await adminNotificationRecipients();
  if (recipients.length === 0) return;

  const subject = "Unauthorized access attempt";
  const body = [
    "Someone was refused access to the site.",
    `When: ${attempt.createdAt.toISOString()}`,
    `Email: ${attempt.email ?? "(not provided by Auth0)"}`,
    `Provider: ${attempt.provider ?? "unknown"}`,
    `Attempt: ${attempt.attemptType}`,
    `Marine Team member: ${DENIAL_EXPLANATIONS[attempt.reason].organization}`,
    `Email authorized: ${DENIAL_EXPLANATIONS[attempt.reason].allowlist}`,
    `Reason: ${DENIAL_EXPLANATIONS[attempt.reason].summary}`,
    "",
    "Review recent attempts in the admin area under Access attempts.",
  ].join("\n");

  // Marked before sending: a send that fails shouldn't leave the cooldown
  // open for a retry loop to hammer through.
  await prisma.unauthorizedAccessAttempt.update({
    where: { id: attempt.id },
    data: { notifiedAt: new Date() },
  });
  await Promise.all(recipients.map((to) => sendEmail(to, subject, body, "/admin/access-attempts")));
}

/**
 * Who hears about refused attempts: every authorized admin, falling back to
 * ADMIN_EMAILS so a brand-new deployment with no admin rows yet still reports.
 */
async function adminNotificationRecipients(): Promise<string[]> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", authorized: true },
    select: { email: true },
  });
  if (admins.length > 0) return admins.map((a) => a.email);

  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => normalizeEmail(email))
    .filter(Boolean);
}

/** Plain-English versions of each denial, shared by the notification email and the admin table. */
export const DENIAL_EXPLANATIONS: Record<
  AccessDenialReason,
  { summary: string; organization: string; allowlist: string }
> = {
  NOT_ORG_MEMBER: {
    summary: "Not a member of the Marine Team organization",
    organization: "no",
    allowlist: "yes",
  },
  EMAIL_NOT_AUTHORIZED: {
    summary: "Email is not on the authorized list",
    organization: "yes",
    allowlist: "no",
  },
  NOT_ORG_MEMBER_AND_EMAIL_NOT_AUTHORIZED: {
    summary: "Neither an organization member nor an authorized email",
    organization: "no",
    allowlist: "no",
  },
  AUTH0_CALLBACK_ERROR: {
    summary: "Auth0 refused the login before the app saw an identity",
    organization: "unknown",
    allowlist: "unknown",
  },
};

/** How long refused attempts are kept before pruning. */
export const ACCESS_ATTEMPT_RETENTION_DAYS = 90;

/**
 * Drops attempts past the retention window. Called from the daily cron rather
 * than on the request path, so a site being probed doesn't pay for cleanup on
 * every refusal — the table is indexed on createdAt for exactly this.
 */
export async function pruneAccessAttempts(retentionDays = ACCESS_ATTEMPT_RETENTION_DAYS): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const { count } = await prisma.unauthorizedAccessAttempt.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return count;
}

/** The client's IP as far as the platform reports it. Only ever used for the attempt record. */
export function clientIpFrom(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return headers.get("x-real-ip");
}

/** The Auth0 connection behind a `sub` like "google-oauth2|1234" — the part before the pipe. */
export function providerFromSub(sub: string | null | undefined): string | null {
  if (!sub) return null;
  const [provider] = sub.split("|");
  return provider || null;
}
