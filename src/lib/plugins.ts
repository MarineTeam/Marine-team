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
  { slug: "watch-history", name: "Watch history", description: "Shows a \"Recently Played\" page and nav tab of everything a member has watched." },
] as const;

export type PluginSlug = (typeof PLUGIN_META)[number]["slug"];

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
 * Every plugin's enabled state for a given category context, in a fixed 2-3
 * queries total regardless of how many plugin slugs are checked or how deep
 * the category tree is: the `Plugin`, `Category`, and `PluginCategoryOverride`
 * tables are each small (tens of rows on a real site, not millions), so
 * fetching each in full and resolving the category chain + override
 * precedence in memory beats querying per-plugin. A page that used to call
 * `isPluginEnabled()` once per plugin — each doing its own plugin lookup,
 * category-chain walk (1 query per level), and override lookup — now does
 * this once for all of them. `isPluginEnabled` below is a thin wrapper
 * around this for call sites that only need one flag.
 */
export async function getPluginStates(categoryId?: string | null): Promise<Record<PluginSlug, boolean>> {
  const [plugins, overrides, categories] = await Promise.all([
    prisma.plugin.findMany(),
    prisma.pluginCategoryOverride.findMany(),
    categoryId ? prisma.category.findMany({ select: { id: true, parentId: true } }) : Promise.resolve([]),
  ]);

  const chain: string[] = [];
  if (categoryId) {
    const parentById = new Map(categories.map((c) => [c.id, c.parentId]));
    let currentId: string | null = categoryId;
    while (currentId) {
      chain.push(currentId);
      currentId = parentById.get(currentId) ?? null;
    }
  }

  const overridesByPlugin = new Map<string, Map<string, boolean>>();
  for (const o of overrides) {
    if (!overridesByPlugin.has(o.pluginId)) overridesByPlugin.set(o.pluginId, new Map());
    overridesByPlugin.get(o.pluginId)!.set(o.categoryId, o.enabled);
  }

  const pluginBySlug = new Map(plugins.map((p) => [p.slug, p]));
  const result = {} as Record<PluginSlug, boolean>;
  for (const meta of PLUGIN_META) {
    const plugin = pluginBySlug.get(meta.slug);
    if (!plugin) {
      result[meta.slug] = true; // fails open, matching pre-plugin-system behavior
      continue;
    }
    let enabled = plugin.enabled;
    const overrideMap = overridesByPlugin.get(plugin.id);
    if (overrideMap) {
      for (const id of chain) {
        const match = overrideMap.get(id);
        if (match !== undefined) {
          enabled = match;
          break;
        }
      }
    }
    result[meta.slug] = enabled;
  }
  return result;
}

/**
 * Whether a single plugin is enabled for the given category context. For a
 * call site that only needs one flag; if you need several, call
 * getPluginStates() once instead — this still does the full 2-3 query
 * resolution under the hood.
 */
export async function isPluginEnabled(slug: PluginSlug, categoryId?: string | null): Promise<boolean> {
  const states = await getPluginStates(categoryId);
  return states[slug];
}
