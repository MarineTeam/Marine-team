"use client";

import { useCallback, useState } from "react";
import { ShareLinkForm } from "@/components/share-link-form";
import { ShareLinkList, type ShareLinkRow } from "@/components/share-link-list";

/**
 * The share-a-link control on a series or video page: collapsed to a single
 * button until asked for, then showing the create form plus this member's
 * existing links *for this content only* — which is the list they want when
 * they're about to share it again, or to revoke the link they sent last week.
 *
 * Their full list across all content lives at /profile/shared-links.
 */
export function ShareLinkPanel({
  seriesId,
  videoId,
  canGrantAccess = false,
}: {
  seriesId?: string;
  videoId?: string;
  /** Whether this sharer may override the content's restriction — resolved server-side. */
  canGrantAccess?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<ShareLinkRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const target = seriesId ? { seriesId } : { videoId: videoId! };

  const load = useCallback(async () => {
    const query = new URLSearchParams(seriesId ? { seriesId } : { videoId: videoId! });
    const res = await fetch(`/api/share-links?${query}`);
    if (res.ok) setLinks(await res.json());
    setLoaded(true);
  }, [seriesId, videoId]);

  // Fetched from the click rather than an effect: nothing here needs to
  // synchronize with an external system, and this way a member who never opens
  // the panel never costs a request.
  function toggle() {
    setOpen((wasOpen) => !wasOpen);
    if (!open && !loaded) load();
  }

  return (
    <div className="rounded-lg border border-sep">
      <button
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
      >
        <span>Share a link{links.length > 0 ? ` (${links.length})` : ""}</span>
        <span className="text-sec">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-sep p-3">
          <ShareLinkForm
            target={target}
            endpoint="/api/share-links"
            canGrantAccess={canGrantAccess}
            onCreated={(link) => setLinks((current) => [link, ...current])}
          />
          <div className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-sec">Links you&apos;ve shared</h3>
            <ShareLinkList links={links} revokeEndpoint="/api/share-links" onChange={load} />
          </div>
        </div>
      )}
    </div>
  );
}
