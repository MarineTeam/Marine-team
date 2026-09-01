"use client";

import { useEffect, useState } from "react";

export function ShareButtons({ title, path }: { title: string; path: string }) {
  const [copied, setCopied] = useState(false);
  /**
   * The origin, learned after mounting rather than read during render.
   *
   * These links are built on the server too, where there is no `location` —
   * so reading it inline left the X and Facebook hrefs holding a *relative*
   * path in the render somebody actually clicks, and sending a share of
   * "/hymns/abc" to a site that has no idea what that is. Setting it in an
   * effect keeps the server's markup and the first client render agreeing
   * (no hydration mismatch) and corrects the links immediately after.
   */
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  const absoluteUrl = `${origin}${path}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (e.g. insecure context); silently ignore.
    }
  }

  const shareText = encodeURIComponent(title);
  const shareUrl = encodeURIComponent(absoluteUrl);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button
        onClick={copyLink}
        className="rounded-md border border-sep px-3 py-1.5 hover:bg-hover"
      >
        {copied ? "Copied!" : "Copy link"}
      </button>
      <a
        href={`https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-md border border-sep px-3 py-1.5 hover:bg-hover"
      >
        Share on X
      </a>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-md border border-sep px-3 py-1.5 hover:bg-hover"
      >
        Share on Facebook
      </a>
    </div>
  );
}
