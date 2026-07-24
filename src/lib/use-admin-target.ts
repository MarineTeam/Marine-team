"use client";

import { usePathname } from "next/navigation";

/**
 * Admin CMS pages are shared between managing real content (/admin/...)
 * and demo content (/admin/demo/...) — same components, same API routes,
 * just a `?target=demo` query param telling the route which database to
 * use. This derives that from the current URL and gives back a helper to
 * build API paths accordingly.
 */
export function useAdminTarget() {
  const pathname = usePathname();
  const isDemo = pathname.startsWith("/admin/demo");

  function apiPath(path: string): string {
    if (!isDemo) return path;
    const [base, query] = path.split("?");
    const params = new URLSearchParams(query);
    params.set("target", "demo");
    return `${base}?${params.toString()}`;
  }

  return { isDemo, apiPath };
}
