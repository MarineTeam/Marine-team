"use client";

import { useEffect, useState } from "react";

type Category = { id: string; name: string };
type Override = { id: string; categoryId: string; enabled: boolean; category: Category };
type Plugin = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  enabled: boolean;
  overrides: Override[];
};

export default function PluginsAdminPage() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [overrideCategoryId, setOverrideCategoryId] = useState("");
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [pluginsRes, categoriesRes] = await Promise.all([
      fetch("/api/admin/plugins"),
      fetch("/api/admin/categories"),
    ]);
    if (pluginsRes.ok) setPlugins(await pluginsRes.json());
    if (categoriesRes.ok) setCategories(await categoriesRes.json());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function toggle(plugin: Plugin) {
    await fetch(`/api/admin/plugins/${plugin.slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !plugin.enabled }),
    });
    await load();
  }

  function openOverrides(slug: string) {
    setExpanded((current) => (current === slug ? null : slug));
    setOverrideCategoryId("");
    setOverrideEnabled(false);
    setError(null);
  }

  async function addOverride(slug: string) {
    if (!overrideCategoryId) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/plugins/${slug}/overrides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: overrideCategoryId, enabled: overrideEnabled }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to add override");
      setOverrideCategoryId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add override");
    }
  }

  async function removeOverride(id: string) {
    await fetch(`/api/admin/plugins/overrides/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Plugins</h1>
        <p className="text-sm text-zinc-500">
          Turn optional features on or off site-wide, and override that default for any specific
          category (and everything under it).
        </p>
      </div>

      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
        {plugins.map((plugin) => (
          <li key={plugin.id} className="p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{plugin.name}</p>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      plugin.enabled
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
                    }`}
                  >
                    {plugin.enabled ? "Active" : "Inactive"}
                  </span>
                </div>
                {plugin.description && <p className="text-sm text-zinc-500">{plugin.description}</p>}
                {plugin.overrides.length > 0 && (
                  <p className="mt-1 text-xs text-zinc-400">
                    {plugin.overrides.length} category override{plugin.overrides.length === 1 ? "" : "s"}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <button
                  onClick={() => toggle(plugin)}
                  className={`rounded-md border px-3 py-1.5 dark:border-zinc-700 ${
                    plugin.enabled ? "" : "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                  }`}
                >
                  {plugin.enabled ? "Deactivate" : "Activate"}
                </button>
                <button
                  onClick={() => openOverrides(plugin.slug)}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 dark:border-zinc-700"
                >
                  {expanded === plugin.slug ? "Close" : "Category overrides"}
                </button>
              </div>
            </div>

            {expanded === plugin.slug && (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 space-y-3 dark:border-zinc-800 dark:bg-zinc-900">
                <ul className="space-y-1.5 text-sm">
                  {plugin.overrides.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2">
                      <span>
                        {o.category.name} — {o.enabled ? "on" : "off"}
                      </span>
                      <button onClick={() => removeOverride(o.id)} className="text-red-600 hover:underline">
                        Remove
                      </button>
                    </li>
                  ))}
                  {plugin.overrides.length === 0 && <li className="text-zinc-500">No overrides yet.</li>}
                </ul>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={overrideCategoryId}
                    onChange={(e) => setOverrideCategoryId(e.target.value)}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <option value="">Choose a category…</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={overrideEnabled ? "on" : "off"}
                    onChange={(e) => setOverrideEnabled(e.target.value === "on")}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <option value="off">Off</option>
                    <option value="on">On</option>
                  </select>
                  <button
                    onClick={() => addOverride(plugin.slug)}
                    disabled={!overrideCategoryId}
                    className="rounded-md bg-zinc-900 text-white px-3 py-1 text-sm disabled:opacity-50 dark:bg-white dark:text-zinc-900"
                  >
                    Add override
                  </button>
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
              </div>
            )}
          </li>
        ))}
        {plugins.length === 0 && <li className="p-4 text-sm text-zinc-500">Loading…</li>}
      </ul>
    </div>
  );
}
