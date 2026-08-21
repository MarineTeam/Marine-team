"use client";

import { useEffect, useState } from "react";

type Branding = {
  name: string;
  shortName: string;
  brand: string;
  brandDeep: string;
  brandLight: string;
  logoUrl: string | null;
};

const COLORS = [
  {
    key: "brandDeep" as const,
    label: "Accent",
    hint: "Links, the active tab, icon buttons. Used as-is on light backgrounds, so it needs to be readable against white.",
  },
  {
    key: "brandLight" as const,
    label: "Accent (light)",
    hint: "The far end of gradients, and the accent in dark mode — where the deep shade would disappear.",
  },
  {
    key: "brand" as const,
    label: "Brand",
    hint: "The wordmark colour. Usually sits between the two above.",
  },
];

/**
 * Re-skinning the site. Three colours and a name: everything else the UI is
 * painted with is derived from these — see lib/branding.ts — which is why this
 * form is short.
 */
export default function BrandingAdminPage() {
  const [branding, setBranding] = useState<Branding | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/branding");
    if (res.ok) setBranding(await res.json());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  function update<K extends keyof Branding>(key: K, value: Branding[K]) {
    setSaved(false);
    setBranding((previous) => (previous ? { ...previous, [key]: value } : previous));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!branding) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(branding),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save branding");
      setBranding(await res.json());
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save branding");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!confirm("Put the name and colours back to the defaults?")) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/branding", { method: "DELETE" });
    if (res.ok) {
      setBranding(await res.json());
      setSaved(true);
    } else {
      setError("Failed to reset branding");
    }
    setBusy(false);
  }

  if (!branding) return <p className="text-sm text-zinc-500">Loading…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Branding</h1>
        <p className="mt-1 text-sm text-zinc-500">
          The name and colours the whole app is painted with, including the installed app&apos;s
          home-screen label. Changes apply everywhere within a few minutes.
        </p>
      </div>

      <form onSubmit={save} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium">Name</span>
            <input
              value={branding.name}
              onChange={(e) => update("name", e.target.value)}
              maxLength={60}
              required
              className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <span className="block text-xs text-zinc-500">Shown in the header and page titles.</span>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Short name</span>
            <input
              value={branding.shortName}
              onChange={(e) => update("shortName", e.target.value)}
              maxLength={60}
              required
              className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <span className="block text-xs text-zinc-500">
              The home-screen icon label, where there is room for about 12 characters.
            </span>
          </label>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Colours</legend>
          {COLORS.map(({ key, label, hint }) => (
            <div key={key} className="flex items-start gap-3">
              <input
                type="color"
                aria-label={label}
                value={branding[key]}
                onChange={(e) => update(key, e.target.value)}
                className="mt-0.5 h-9 w-12 shrink-0 cursor-pointer rounded border border-zinc-300 bg-transparent dark:border-zinc-700"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{label}</span>
                  <input
                    value={branding[key]}
                    onChange={(e) => update(key, e.target.value)}
                    spellCheck={false}
                    className="w-28 rounded-md border border-zinc-300 px-2 py-1 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </div>
                <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>
              </div>
            </div>
          ))}
        </fieldset>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Logo URL</span>
          <input
            value={branding.logoUrl ?? ""}
            onChange={(e) => update("logoUrl", e.target.value || null)}
            placeholder="/icon.svg"
            className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <span className="block text-xs text-zinc-500">
            A path on this site, or an https:// URL. Leave empty to show the first letter of the
            name on the brand gradient instead.
          </span>
        </label>

        <Preview branding={branding} />

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && !error && <p className="text-sm text-green-600">Saved.</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={busy}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Reset to defaults
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Shows the header treatment with the unsaved values, so a choice can be
 * judged before it lands on every page. Styled from the local values rather
 * than the CSS variables for exactly that reason — the variables still hold
 * what is saved.
 */
function Preview({ branding }: { branding: Branding }) {
  const gradient = `linear-gradient(135deg, ${branding.brandLight}, ${branding.brandDeep})`;
  const initial = branding.shortName.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Preview</p>
      <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <span
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-[28%] text-base font-bold text-white"
          style={{ background: gradient }}
        >
          {initial}
        </span>
        <span className="truncate text-[17px] font-bold" style={{ color: branding.brand }}>
          {branding.name}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <span
            className="rounded-md px-2 py-0.5 text-xs font-medium"
            style={{ color: branding.brandDeep, background: `${branding.brandDeep}1a` }}
          >
            Member
          </span>
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold text-white"
            style={{ background: gradient }}
          >
            Log in
          </span>
        </span>
      </div>
    </div>
  );
}
