/**
 * Props for a `<script type="application/ld+json">` tag. Escapes `<` so a
 * title/description containing `</script>` can't break out of the tag —
 * the sanitization Next's own JSON-LD guide recommends.
 */
export function jsonLdScriptProps(data: unknown) {
  return {
    type: "application/ld+json",
    dangerouslySetInnerHTML: { __html: JSON.stringify(data).replace(/</g, "\\u003c") },
  } as const;
}

export type BreadcrumbItem = { label: string; href?: string };

/**
 * Builds the schema.org BreadcrumbList from the same items the visible
 * <Breadcrumbs> nav renders, so the two can never drift out of sync. `href`
 * is resolved to an absolute URL with `absolutize` (siteUrl from
 * src/lib/seo.ts) since JSON-LD, unlike next/metadata, has no metadataBase
 * to resolve relative paths against.
 */
export function breadcrumbListJsonLd(items: BreadcrumbItem[], absolutize: (path: string) => string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.label,
      ...(item.href ? { item: absolutize(item.href) } : {}),
    })),
  };
}
