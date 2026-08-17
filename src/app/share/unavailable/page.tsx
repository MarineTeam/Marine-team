import Link from "next/link";

/**
 * Where /s/[token] sends someone whose link didn't work. The reasons are
 * deliberately specific — "revoked" and "expired" tell the recipient to ask
 * the sharer for a new link, which "this link doesn't work" wouldn't.
 */
const MESSAGES: Record<string, { heading: string; detail: string }> = {
  revoked: {
    heading: "This link has been revoked",
    detail: "Whoever shared it has since turned it off. Ask them for a new link.",
  },
  expired: {
    heading: "This link has expired",
    detail: "It was set to stop working after a while. Ask whoever shared it for a new one.",
  },
  forbidden: {
    heading: "This link isn’t for this account",
    detail:
      "It was shared privately with specific people. If you have another email address, log out and sign back in with the one it was sent to.",
  },
  gone: {
    heading: "This content isn’t available",
    detail: "The series or video behind this link has been taken down since it was shared.",
  },
  invalid: {
    heading: "We couldn’t find that link",
    detail: "Check you copied the whole thing — links are long and easy to cut short.",
  },
};

export default async function ShareUnavailablePage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const { heading, detail } = MESSAGES[reason ?? ""] ?? MESSAGES.invalid;

  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">{heading}</h1>
      <p className="text-sm text-zinc-500">{detail}</p>
      <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
        <Link
          href="/"
          className="rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
        >
          Browse the site
        </Link>
        {reason === "forbidden" && (
          <a
            href="/auth/logout"
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Log out
          </a>
        )}
      </div>
    </div>
  );
}
