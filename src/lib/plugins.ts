import { prisma } from "@/lib/db";

export const PLUGIN_META = [
  { slug: "favorites", name: "Favorites", description: "Lets members bookmark series and videos to a My Favorites page." },
  { slug: "comments", name: "Comments", description: "Lets members discuss a series or video underneath it." },
  { slug: "related-content", name: "Related content", description: "Shows \"More like this\" / \"You might also like\" rows." },
  { slug: "ratings", name: "Ratings", description: "Lets members leave a 1-5 star rating on a series or video." },
  { slug: "watch-later", name: "Watch later", description: "Lets members queue a series or video to a Watch Later page, separate from Favorites." },
  { slug: "notifications", name: "Notifications", description: "Sends a web push notification to subscribed members when new content is published." },
  { slug: "view-counts", name: "View counts", description: "Shows a play/view counter on series and video pages." },
  { slug: "social-share", name: "Social share", description: "Shows copy-link and share-to buttons on series and video pages." },
  { slug: "announcements", name: "Announcements", description: "Shows a dismissible site-wide banner message." },
  { slug: "subscriptions", name: "Subscriptions", description: "Lets members follow a series or category and get notified when it publishes new content." },
  { slug: "playlists", name: "Playlists", description: "Lets members build their own ordered video playlists." },
  { slug: "likes-dislikes", name: "Likes / dislikes", description: "Lets members like or dislike a series or video." },
  { slug: "up-next", name: "Up next", description: "Shows an \"Up next\" panel with the next video in a series, with an autoplay option." },
] as const;

export type PluginSlug = (typeof PLUGIN_META)[number]["slug"];

async function categoryChainIds(categoryId: string): Promise<string[]> {
  const ids: string[] = [];
  let currentId: string | null = categoryId;
  while (currentId) {
    ids.push(currentId);
    const category: { parentId: string | null } | null = await prisma.category.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });
    currentId = category?.parentId ?? null;
  }
  return ids;
}

/** Creates any missing known plugin rows (default enabled), so admin pages always have something to show. */
export async function ensurePluginsSeeded(): Promise<void> {
  await Promise.all(
    PLUGIN_META.map((meta) =>
      prisma.plugin.upsert({
        where: { slug: meta.slug },
        create: { slug: meta.slug, name: meta.name, description: meta.description, enabled: true },
        update: {},
      }),
    ),
  );
}

/**
 * Whether a plugin is enabled for the given category context. Falls back to
 * the site-wide default if there's no override; the nearest ancestor's
 * override wins over a more distant one. Fails open (enabled) if the plugin
 * row doesn't exist yet, matching pre-plugin-system behavior.
 */
export async function isPluginEnabled(slug: PluginSlug, categoryId?: string | null): Promise<boolean> {
  const plugin = await prisma.plugin.findUnique({ where: { slug } });
  if (!plugin) return true;
  if (!categoryId) return plugin.enabled;

  const chain = await categoryChainIds(categoryId);
  const overrides = await prisma.pluginCategoryOverride.findMany({
    where: { pluginId: plugin.id, categoryId: { in: chain } },
  });
  if (overrides.length === 0) return plugin.enabled;

  const overrideByCategory = new Map(overrides.map((o) => [o.categoryId, o.enabled]));
  for (const id of chain) {
    const match = overrideByCategory.get(id);
    if (match !== undefined) return match;
  }
  return plugin.enabled;
}
