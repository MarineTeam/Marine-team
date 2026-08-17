"use client";

import { useCallback, useState } from "react";
import { ShareLinkList, type ShareLinkRow } from "@/components/share-link-list";

/**
 * Thin client wrapper around ShareLinkList for the profile page: holds the
 * list state so a revoke updates in place, and re-fetches from the member's
 * own endpoint afterwards rather than trusting the local edit.
 */
export function SharedLinksManager({ initialLinks }: { initialLinks: ShareLinkRow[] }) {
  const [links, setLinks] = useState(initialLinks);

  const reload = useCallback(async () => {
    const res = await fetch("/api/share-links");
    if (res.ok) setLinks(await res.json());
  }, []);

  if (links.length === 0) return null;

  return <ShareLinkList links={links} revokeEndpoint="/api/share-links" onChange={reload} />;
}
