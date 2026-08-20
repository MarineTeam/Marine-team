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
