"use client";

import { useState } from "react";

export type ShareLinkRow = {
  id: string;
  token: string;
  visibility: "PUBLIC" | "EMAIL";
  grantsAccess: boolean;
  note: string | null;
  /** Whether a password is set — never the password or its hash, which stay server-side. */
  passwordProtected: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
  createdAt: string;
  recipients: { email: string }[];
  series: { title: string; slug: string } | null;
  video: { title: string; slug: string } | null;
  createdBy?: { email: string; name: string | null; displayName: string | null };
};

type Status = { label: string; tone: "live" | "dead" };

/** Derived rather than stored: expiry passing shouldn't need a write to become true. */
function statusOf(link: ShareLinkRow): Status {
  if (link.revokedAt) return { label: "Revoked", tone: "dead" };
  if (link.expiresAt && new Date(link.expiresAt) <= new Date()) return { label: "Expired", tone: "dead" };
  return { label: "Active", tone: "live" };
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * One member's shared links, or (with `showOwner`) every link on the site for
 * the admin panel. The same list either way — a sharer and an admin want the
 * same facts about a link: where it points, who can open it, how often it has
 * been, and a button to switch it off.
 */
export function ShareLinkList({
  links,
  revokeEndpoint,
  showOwner = false,
  onChange,
}: {
  links: ShareLinkRow[];
  /** Base path the row's id is appended to, e.g. "/api/share-links"; PATCH revokes, DELETE removes. */
  revokeEndpoint: string;
  showOwner?: boolean;
  onChange: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Revoke (PATCH) keeps the row, marked dead, so the sharer can still see
   * they sent it. Delete (DELETE) removes it from the list entirely. Both stop
   * the link working — the token only resolves through this row — so deleting
   * an active link isn't a way to leave something live.
   */
  async function act(link: ShareLinkRow, action: "revoke" | "delete") {
    const confirmed =
      action === "revoke"
        ? confirm("Revoke this link? Anyone holding it loses access immediately.")
        : confirm("Delete this link? It stops working and disappears from this list.");
    if (!confirmed) return;

    setBusyId(link.id);
    setError(null);
    try {
      const res = await fetch(`${revokeEndpoint}/${link.id}`, {
        method: action === "revoke" ? "PATCH" : "DELETE",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `Failed to ${action}`);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally {
      setBusyId(null);
    }
  }

  async function copy(link: ShareLinkRow) {
    // Built here rather than server-side so the copied link always matches the
    // origin the sharer is actually on (localhost, preview, or production).
    const url = `${window.location.origin}/s/${link.token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(link.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard API can be unavailable (insecure context); ignore, the
      // sharer can still read the link off the row.
    }
  }

  if (links.length === 0) {
    return <p className="text-sm text-zinc-500">No share links yet.</p>;
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {links.map((link) => {
          const status = statusOf(link);
          const target = link.video ?? link.series;
          const href = link.video ? `/videos/${link.video.slug}` : link.series ? `/series/${link.series.slug}` : null;
          return (
            <li key={link.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {href ? (
                    <a href={href} className="truncate font-medium hover:underline">
                      {target?.title}
                    </a>
                  ) : (
                    <span className="truncate font-medium text-zinc-500">Content removed</span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      status.tone === "live"
                        ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                        : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    {status.label}
                  </span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {link.visibility === "EMAIL" ? "Private" : "Public"}
                  </span>
                  {link.grantsAccess && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      Grants access
                    </span>
                  )}
                  {link.passwordProtected && (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      🔒 Password
                    </span>
                  )}
                </div>
                {link.note && <p className="text-sm text-zinc-600 dark:text-zinc-300">{link.note}</p>}
                {link.visibility === "EMAIL" && link.recipients.length > 0 && (
                  <p className="truncate text-xs text-zinc-500">
                    Shared with {link.recipients.map((r) => r.email).join(", ")}
                  </p>
                )}
                <p className="text-xs text-zinc-500">
                  {showOwner && link.createdBy && <>By {link.createdBy.displayName || link.createdBy.name || link.createdBy.email} · </>}
                  Created {formatDate(link.createdAt)}
                  {link.expiresAt && <> · {status.label === "Expired" ? "Expired" : "Expires"} {formatDate(link.expiresAt)}</>}
                  {" · "}
                  Opened {link.viewCount} time{link.viewCount === 1 ? "" : "s"}
                  {link.lastViewedAt && <> (last {formatDate(link.lastViewedAt)})</>}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-sm">
                <button
                  onClick={() => copy(link)}
                  className="rounded-md border border-zinc-300 px-3 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  {copiedId === link.id ? "Copied!" : "Copy link"}
                </button>
                {!link.revokedAt && (
                  <button
                    onClick={() => act(link, "revoke")}
                    disabled={busyId === link.id}
                    className="rounded-md border border-amber-300 px-3 py-1 text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-900 dark:text-amber-400 dark:hover:bg-amber-950"
                  >
                    Revoke
                  </button>
                )}
                <button
                  onClick={() => act(link, "delete")}
                  disabled={busyId === link.id}
                  className="rounded-md border border-red-300 px-3 py-1 text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                >
                  {busyId === link.id ? "Working…" : "Delete"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
