"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * QueryMonitorPanel lives in the root layout, which Next.js's App Router
 * treats as shared/persistent across navigations — a client-side nav to
 * another page only re-renders the page segment that changed and reuses
 * the layout's previous render untouched (that's "partial rendering",
 * intentional for perf), so without this the panel would keep showing
 * whichever page happened to trigger the last full/hard load forever.
 * router.refresh() forces the whole tree, including the panel, to
 * recompute against the new page's actual request.
 */
export function QueryMonitorRefresher() {
  const pathname = usePathname();
  const router = useRouter();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    router.refresh();
  }, [pathname, router]);

  return null;
}
