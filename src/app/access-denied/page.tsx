import Link from "next/link";
import { allowedOrganizationIds, isGuestLoginEnabled, organizationRequired } from "@/lib/authorization";

/**
 * Where every refused login lands. Deliberately says the same thing whatever
 * went wrong: an organization rejection, an email that isn't on the list, and
 * a failed callback are one message to the visitor, because telling someone
 * *which* half they failed tells an attacker which half to work on.
 *
 * What it never shows: a CallbackHandlerError, an Auth0 stack trace, a Prisma
 * error, a raw 400, or anything about the allowlist's contents.
 */
export default async function AccessDeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  // Read but not shown — the reason distinguishes "Auth0 refused" from "we
  // refused" in logs and analytics without leaking it to the visitor.
  await searchParams;

  const showGuestOption =
    organizationRequired() && allowedOrganizationIds().length > 0 && (await isGuestLoginEnabled());

  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
      <h1 className="text-3xl font-bold tracking-tight text-ink">You don&apos;t have access</h1>
      <p className="text-sm text-sec">
        You are not authorized to access this application. Please contact an administrator if you believe you
        should have access.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
        {/* A full logout, not just a link home: whatever Auth0 session exists
            belongs to an identity we refused, and leaving it in place would
            send them straight back here on the next login attempt. */}
        <a
          href="/auth/logout"
          className="rounded-md btn-primary text-white px-4 py-2 text-sm"
        >
          Sign out
        </a>
        <Link
          href="/"
          className="rounded-md border border-sep px-4 py-2 text-sm hover:bg-hover"
        >
          Back to the site
        </Link>
      </div>

      {/* Shown only where the normal login demands an organization (the one
          configuration in which an invited guest gets stuck here through no
          fault of their own — Auth0 refuses them at the identity provider
          before their allowlist entry is ever consulted) and only while an
          admin has actually opened /auth/guest at /admin/authorized-emails.
          The link grants nothing on its own — it only starts a login that
          doesn't name an organization, after which the same allowlist check
          decides. */}
      {showGuestOption && (
        <p className="pt-2 text-sm text-sec">
          Invited as a guest, without being part of the organization?{" "}
          <a href="/auth/guest" className="underline">
            Sign in that way instead
          </a>
          .
        </p>
      )}
    </div>
  );
}
