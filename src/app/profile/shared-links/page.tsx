import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { isPluginEnabled } from "@/lib/plugins";
import { getShareLinks } from "@/lib/share-links";
import { SharedLinksManager } from "@/components/shared-links-manager";

/**
 * Every link this member has shared, across all content. The create form
 * lives on the series/video page itself (where the thing being shared is
 * unambiguous); this is the ledger and the revoke switch.
 */
export default async function ProfileSharedLinksPage() {
  const user = await getCurrentUser();
  if (!user) return null; // The layout already gates on login.

  const [links, shareLinksOn] = await Promise.all([
    getShareLinks({ createdById: user.id }),
    isPluginEnabled("share-links"),
  ]);

  const items = links.map((link) => ({
    ...link,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    revokedAt: link.revokedAt?.toISOString() ?? null,
    lastViewedAt: link.lastViewedAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium">Shared links</h2>
        <p className="mt-1 text-sm text-zinc-500">
          {shareLinksOn ? (
            <>
              Create a link from any series or video page. Revoking one here cuts off everyone holding it,
              immediately.
            </>
          ) : (
            <>
              Sharing is currently turned off site-wide, so no new links can be created — your existing links are
              below, and you can still revoke them.
            </>
          )}
        </p>
      </div>
      <SharedLinksManager initialLinks={items} />
      {items.length === 0 && shareLinksOn && (
        <p className="text-sm text-zinc-500">
          Nothing shared yet — open a{" "}
          <Link href="/" className="underline">
            series or video
          </Link>{" "}
          and use “Share a link”.
        </p>
      )}
    </div>
  );
}
