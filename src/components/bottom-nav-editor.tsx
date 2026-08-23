"use client";

import { useEffect, useState } from "react";
import { NAV_ICONS } from "@/components/app-sidebar";
import { readDeviceSettings, writeDeviceSettings } from "@/lib/device-settings";
import { MAX_TABS, resolveTabs } from "@/lib/nav-tabs";
import type { NavItem } from "@/lib/nav";

/**
 * Picks what sits in the bottom bar on this device.
 *
 * The bar is the installed app's only navigation, so this is less a
 * preference than a layout: someone whose reason for having the app is the
 * hymnal should be able to put the hymnal in it. Stored per device with the
 * other device settings — nothing here goes to the server — and applied
 * immediately, because BottomNav listens for the same change event.
 *
 * `options` is everything this viewer may see, resolved on the server; a
 * choice is stored as hrefs and re-resolved against it on every render, so a
 * category that later disappears takes its icon with it.
 */
export function BottomNavEditor({ options, suggested }: { options: NavItem[]; suggested: NavItem[] }) {
  // Null is "no choice yet", which shows the app's suggestion. Read after
  // mount for the usual reason: localStorage isn't there during a server
  // render.
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChosen(readDeviceSettings().tabHrefs);
    setReady(true);
  }, []);

  const current = resolveTabs(options, chosen, suggested);
  const currentHrefs = current.map((tab) => tab.href);
  const available = options.filter((option) => !currentHrefs.includes(option.href));

  function save(hrefs: string[] | null) {
    setChosen(hrefs);
    writeDeviceSettings({ tabHrefs: hrefs });
  }

  function add(href: string) {
    if (currentHrefs.length >= MAX_TABS) return;
    save([...currentHrefs, href]);
  }

  function remove(href: string) {
    // The last one is kept: an empty bar would leave an installed app with no
    // way to get anywhere, and "Use the suggested set" is the way back.
    if (currentHrefs.length <= 1) return;
    save(currentHrefs.filter((item) => item !== href));
  }

  function move(href: string, by: -1 | 1) {
    const at = currentHrefs.indexOf(href);
    const to = at + by;
    if (at === -1 || to < 0 || to >= currentHrefs.length) return;
    const next = [...currentHrefs];
    [next[at], next[to]] = [next[to], next[at]];
    save(next);
  }

  return (
    <section className="space-y-3" aria-busy={!ready}>
      <div>
        <h3 className="text-sm font-medium">Bottom bar</h3>
        <p className="text-xs text-sec">
          The icons along the bottom of the app, in order. Up to {MAX_TABS}. Add the section you open most —
          a hymnal book you&apos;ve saved for offline stays reachable from its icon even with no connection.
        </p>
      </div>

      <ol className="divide-y divide-sep rounded-lg border border-sep text-sm">
        {current.map((tab, index) => {
          const Icon = NAV_ICONS[tab.icon];
          return (
            <li key={tab.href} className="flex items-center gap-2 px-3 py-2">
              <Icon className="h-5 w-5 shrink-0 text-sec" />
              <span className="min-w-0 flex-1 truncate">{tab.label}</span>
              <button
                onClick={() => move(tab.href, -1)}
                disabled={index === 0}
                aria-label={`Move ${tab.label} left`}
                className="rounded-md border border-sep px-2 py-1 text-xs disabled:opacity-40"
              >
                ↑
              </button>
              <button
                onClick={() => move(tab.href, 1)}
                disabled={index === current.length - 1}
                aria-label={`Move ${tab.label} right`}
                className="rounded-md border border-sep px-2 py-1 text-xs disabled:opacity-40"
              >
                ↓
              </button>
              <button
                onClick={() => remove(tab.href)}
                disabled={current.length <= 1}
                aria-label={`Remove ${tab.label}`}
                className="rounded-md border border-sep px-2 py-1 text-xs disabled:opacity-40"
              >
                Remove
              </button>
            </li>
          );
        })}
      </ol>

      {available.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-sec">
            {currentHrefs.length >= MAX_TABS
              ? `The bar is full — remove one to add another.`
              : "Add:"}
          </p>
          <div className="flex flex-wrap gap-2">
            {available.map((option) => {
              const Icon = NAV_ICONS[option.icon];
              return (
                <button
                  key={option.href}
                  onClick={() => add(option.href)}
                  disabled={currentHrefs.length >= MAX_TABS}
                  className="flex items-center gap-1.5 rounded-md border border-sep px-2.5 py-1.5 text-sm hover:bg-hover disabled:opacity-40"
                >
                  <Icon className="h-4 w-4 text-sec" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {chosen !== null && (
        <button onClick={() => save(null)} className="text-xs text-sec underline">
          Use the suggested icons
        </button>
      )}
    </section>
  );
}
