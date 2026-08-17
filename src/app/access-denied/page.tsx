import Link from "next/link";

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

  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">You don&apos;t have access</h1>
      <p className="text-sm text-zinc-500">
        You are not authorized to access this application. Please contact an administrator if you believe you
        should have access.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
        {/* A full logout, not just a link home: whatever Auth0 session exists
            belongs to an identity we refused, and leaving it in place would
            send them straight back here on the next login attempt. */}
        <a
          href="/auth/logout"
          className="rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
        >
          Sign out
        </a>
        <Link
          href="/"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Back to the site
        </Link>
      </div>
    </div>
  );
}
