import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import type { AccessAttemptType, AccessDenialReason } from "@prisma/client";

/**
 * The application's authorization model: two independent checks, combined
 * according to `AUTHORIZATION_MODE`:
 *
 *   authenticated with Auth0
 *     -> member of an approved Auth0 organization   (org_id on the ID token)
 *     -> email present and ACTIVE in AuthorizedEmail (PostgreSQL)
 *     -> application access
 *
 * The organization half is proved by the `org_id` claim of the ID token the
 * SDK has already verified — never by anything the browser sends us — and the
 * allowlist half is a database read, so removing an email takes effect on the
 * next request rather than whenever a token happens to expire.
 *
 * A single `AuthorizedEmail` row can also be flagged `organizationExempt`,
 * which lets that one address in without organization membership regardless
 * of mode — see authorizeIdentity. That's the difference between "invite a
 * guest" and EITHER mode: EITHER changes the rule for everyone on the
 * allowlist, an exempt row changes it for one address an admin named.
 */

/**
 * How the two checks combine, set by the `AUTHORIZATION_MODE` environment
 * variable.
 *
 * `BOTH` is the default and the strictest posture: neither check is
 * sufficient alone. `ORGANIZATION` and `ALLOWLIST` drop one check entirely,
 * for a deployment that only wants a single gate. `EITHER` keeps both checks
 * live but requires only one to pass — the "personal account or organization
 * account" case: someone who is a member of an approved organization gets in
 * on that alone, and someone who isn't (a personal Google account, say) still
 * gets in with an ACTIVE allowlist entry. It differs from `BOTH` in exactly
 * one way: `BOTH` is an AND of the two checks, `EITHER` is an OR.
 */
export type AuthorizationMode = "BOTH" | "ORGANIZATION" | "ALLOWLIST" | "EITHER";

const AUTHORIZATION_MODES: AuthorizationMode[] = ["BOTH", "ORGANIZATION", "ALLOWLIST", "EITHER"];

/**
 * Reads the mode, defaulting to the strictest one.
 *
 * Anything unrecognised — a typo, an empty string, a value meant for a
 * different app — resolves to `BOTH` rather than to something permissive. A
 * misconfigured environment variable must never be the thing that opens a
 * door, so there is deliberately no value that disables both checks.
 */
export function authorizationMode(): AuthorizationMode {
  const configured = process.env.AUTHORIZATION_MODE?.trim().toUpperCase();
  return AUTHORIZATION_MODES.includes(configured as AuthorizationMode)
    ? (configured as AuthorizationMode)
    : "BOTH";
}

/** Whether the organization half is enforced under the active mode. */
export function organizationRequired(mode = authorizationMode()): boolean {
  return mode === "BOTH" || mode === "ORGANIZATION";
}

/** Whether the database allowlist is enforced under the active mode. */
export function allowlistRequired(mode = authorizationMode()): boolean {
  return mode === "BOTH" || mode === "ALLOWLIST";
}

/** One line describing the active mode, for the admin screens. */
export const MODE_DESCRIPTIONS: Record<AuthorizationMode, string> = {
  BOTH: "Members need membership of an approved Auth0 organization AND an active entry here.",
  ORGANIZATION:
    "Members only need membership of an approved Auth0 organization — this list is not currently enforced.",
  ALLOWLIST: "Members only need an active entry here — Auth0 organization membership is not enforced.",
  EITHER:
    "Members need EITHER membership of an approved Auth0 organization OR an active entry here — whichever they have is enough, and Auth0 offers a choice between a personal account and an organization at login.",
};

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

/**
 * Every Auth0 organization this deployment accepts, from a comma-separated
 * `AUTH0_ORGANIZATION_ID`.
 *
 * A single value is still valid and still behaves exactly as it did when this
 * was a one-org setting — which is what lets a deployment add a second
 * organization without any change in behaviour until it actually does.
 *
 * An empty list means the organization check cannot be satisfied by anyone; see
 * isOrganizationMember, which treats that as a denial rather than a no-op.
 */
export function allowedOrganizationIds(): string[] {
  return (process.env.AUTH0_ORGANIZATION_ID ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/**
 * Whether the session's organization claim names one of the accepted
 * organizations.
 *
 * Fails closed when `AUTH0_ORGANIZATION_ID` isn't set: a missing configuration
 * must not silently turn a required check into a no-op. The comparison is
 * against the claim from the verified ID token, never a query parameter or
 * header, so a browser can't assert membership it doesn't have — a member who
 * picks an organization at the Auth0 prompt is still only admitted if that
 * organization is one we listed.
 */
export function isOrganizationMember(orgIdFromToken: string | null | undefined): boolean {
  if (!orgIdFromToken) return false;
  const allowed = allowedOrganizationIds();
  if (allowed.length === 0) return false;
  return allowed.includes(orgIdFromToken);
}

export type EmailAuthorization = {
  authorized: boolean;
  /**
   * Whether this specific address is let in on `authorized` alone, with no
   * organization check — the targeted "invite a guest" escape hatch from
   * BOTH mode, set per row rather than by relaxing the mode for everyone.
   * Always false for a bootstrap-adopted address; a guest exemption is
   * something an administrator has to grant deliberately.
   */
  organizationExempt: boolean;
};

/** The allowlist's full verdict on this address: whether it's active, and whether it's exempt from the organization check. */
async function lookupEmailAuthorization(email: string | null | undefined): Promise<EmailAuthorization> {
  if (!email) return { authorized: false, organizationExempt: false };
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) return { authorized: false, organizationExempt: false };

  const row = await prisma.authorizedEmail.findUnique({
    where: { email: normalized },
    select: { status: true, organizationExempt: true },
  });
  if (row) return { authorized: row.status === "ACTIVE", organizationExempt: row.organizationExempt };

  return { authorized: await adoptBootstrapAdmin(normalized), organizationExempt: false };
}

/** Whether this email is on the allowlist and active. Takes any casing; normalizes before the lookup. */
export async function isEmailAuthorized(email: string | null | undefined): Promise<boolean> {
  return (await lookupEmailAuthorization(email)).authorized;
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

/**
 * Grants an email access, and syncs the `User` row that reads from it.
 *
 * The single write path for "let this person in", used by both admin screens:
 * the Authorized emails list and the Grant access button on the Access page.
 * Having one path is the point — `getCurrentUser()` recomputes
 * `User.authorized` from this table on every request, so anything that sets
 * that flag *without* touching the allowlist is silently undone on the user's
 * next page load.
 */
export async function grantEmailAccess({
  email,
  actorId,
  actorEmail,
  note,
}: {
  email: string;
  actorId?: string | null;
  actorEmail?: string | null;
  note?: string | null;
}): Promise<{ email: string }> {
  const normalized = normalizeEmail(email);

  await prisma.authorizedEmail.upsert({
    where: { email: normalized },
    create: {
      email: normalized,
      note: note?.trim() || null,
      addedById: actorId ?? null,
      addedByEmail: actorEmail ?? null,
    },
    // Re-granting a suspended address reinstates it, which is what an
    // administrator means by pressing the button again.
    update: { status: "ACTIVE" },
  });
  await prisma.user.updateMany({ where: { email: normalized }, data: { authorized: true } });

  return { email: normalized };
}

/**
 * Withdraws access: suspends the allowlist entry rather than deleting it, so
 * the record of who granted it and when survives. The matching `User` row is
 * demoted at once so the queries that read `authorized` directly (notification
 * fan-out, admin lists) agree immediately, rather than waiting for that
 * person's next request.
 */
export async function suspendEmailAccess(email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  await prisma.authorizedEmail.updateMany({
    where: { email: normalized },
    data: { status: "SUSPENDED" },
  });
  await prisma.user.updateMany({ where: { email: normalized }, data: { authorized: false } });
}

export type AuthorizationResult =
  // Both results are reported even when allowed, since under a single-check
  // mode one of them can legitimately be false.
  | { allowed: true; organizationMember: boolean; emailAuthorized: boolean }
  | {
      allowed: false;
      organizationMember: boolean;
      emailAuthorized: boolean;
      reason: AccessDenialReason;
    };

/**
 * Whether the two check results add up to access under the active mode. Pure,
 * so the whole truth table — four modes by four combinations — is testable
 * without a database or a session.
 *
 * `EITHER` is the one mode that isn't "AND of whichever checks are required":
 * it's an OR of the two check results directly, which is why it's handled
 * separately rather than folded into organizationRequired/allowlistRequired —
 * neither check is "required" under EITHER, each is independently sufficient.
 */
export function isAuthorized(
  mode: AuthorizationMode,
  organizationMember: boolean,
  emailAuthorized: boolean,
): boolean {
  if (mode === "EITHER") return organizationMember || emailAuthorized;
  if (organizationRequired(mode) && !organizationMember) return false;
  if (allowlistRequired(mode) && !emailAuthorized) return false;
  return true;
}

/**
 * Which denial to record. Only reports checks the active mode actually
 * enforces: under ORGANIZATION mode an address that happens not to be on the
 * allowlist didn't cause the refusal, and saying it did would send an
 * administrator to fix the wrong thing.
 *
 * Only ever called after `isAuthorized` returns false, so under `EITHER` both
 * checks are known to have failed by the time this runs.
 */
export function denialReasonFor(
  mode: AuthorizationMode,
  organizationMember: boolean,
  emailAuthorized: boolean,
): AccessDenialReason {
  if (mode === "EITHER") return "NOT_ORG_MEMBER_AND_EMAIL_NOT_AUTHORIZED";

  const failedOrg = organizationRequired(mode) && !organizationMember;
  const failedAllowlist = allowlistRequired(mode) && !emailAuthorized;

  if (failedOrg && failedAllowlist) return "NOT_ORG_MEMBER_AND_EMAIL_NOT_AUTHORIZED";
  if (failedOrg) return "NOT_ORG_MEMBER";
  return "EMAIL_NOT_AUTHORIZED";
}

/**
 * The whole decision for one identity.
 *
 * Both halves are always evaluated, even the one the active mode doesn't
 * enforce, so the recorded attempt captures the full picture — an
 * administrator reviewing a refusal under ORGANIZATION mode can still see
 * whether that person was on the allowlist, which is exactly what they need
 * before tightening the mode back up.
 *
 * A row flagged `organizationExempt` is a deliberate, per-address exception
 * to whatever `mode` says: an ACTIVE exempt row is enough on its own,
 * organization or not, checked before `isAuthorized` rather than folded into
 * its truth table. This is what "invite a guest" means under BOTH mode
 * without switching the whole deployment to EITHER — everyone else still
 * needs both checks; only the specific addresses an admin has opted out stop
 * needing the organization half.
 */
export async function authorizeIdentity(identity: {
  email: string | null | undefined;
  orgId: string | null | undefined;
}): Promise<AuthorizationResult> {
  const mode = authorizationMode();
  const organizationMember = isOrganizationMember(identity.orgId);
  const emailAuth = await lookupEmailAuthorization(identity.email);
  const emailAuthorized = emailAuth.authorized;

  if (emailAuthorized && emailAuth.organizationExempt) {
    return { allowed: true, organizationMember, emailAuthorized };
  }

  if (isAuthorized(mode, organizationMember, emailAuthorized)) {
    return { allowed: true, organizationMember, emailAuthorized };
  }
  return {
    allowed: false,
    organizationMember,
    emailAuthorized,
    reason: denialReasonFor(mode, organizationMember, emailAuthorized),
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
  /**
   * The Auth0 SDK's own error code/message for an AUTH0_CALLBACK_ERROR —
   * e.g. "authorization_error: user does not belong to organization". Never
   * a token, code, or secret; see the column comment in schema.prisma.
   */
  detail?: string | null;
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
        detail: sanitizeForRecord(attempt.detail, 300),
        ipAddress: sanitizeForRecord(attempt.ipAddress, 64),
        userAgent: sanitizeForRecord(attempt.userAgent, 256),
      },
      select: {
        id: true,
        email: true,
        provider: true,
        attemptType: true,
        reason: true,
        detail: true,
        createdAt: true,
      },
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
  detail: string | null;
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
    `Organization member: ${DENIAL_EXPLANATIONS[attempt.reason].organization}`,
    `Email authorized: ${DENIAL_EXPLANATIONS[attempt.reason].allowlist}`,
    `Reason: ${DENIAL_EXPLANATIONS[attempt.reason].summary}`,
    ...(attempt.detail ? [`Detail: ${attempt.detail}`] : []),
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
    summary: "Not a member of an approved organization",
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
