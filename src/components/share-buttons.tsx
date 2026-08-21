"use client";

import { useState } from "react";

export function ShareButtons({ title, path }: { title: string; path: string }) {
  const [copied, setCopied] = useState(false);

  function absoluteUrl() {
    return typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(absoluteUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (e.g. insecure context); silently ignore.
    }
  }

  const shareText = encodeURIComponent(title);
  const shareUrl = encodeURIComponent(absoluteUrl());

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
