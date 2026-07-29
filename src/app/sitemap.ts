import type { MetadataRoute } from "next";
import { getSitemapData } from "@/lib/content";

// Queries the DB, which isn't reachable at build time in this app (see the
// same reasoning in the root layout) — force this to render per-request.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const { categories, series, videos, tags } = await getSitemapData();

  return [
    { url: baseUrl, changeFrequency: "daily", priority: 1 },
    ...categories.map((c) => ({
      url: `${baseUrl}/categories/${c.slug}`,
      lastModified: c.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...series.map((s) => ({
      url: `${baseUrl}/series/${s.slug}`,
      lastModified: s.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...videos.map((v) => ({
      url: `${baseUrl}/videos/${v.slug}`,
      lastModified: v.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...tags.map((tag) => ({
      url: `${baseUrl}/tags/${encodeURIComponent(tag)}`,
      changeFrequency: "weekly" as const,
      priority: 0.3,
    })),
  ];
}
