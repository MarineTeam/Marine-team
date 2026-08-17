"use client";

import { useEffect, useState } from "react";

type Group = { id: string; name: string };
type Policy = {
  platform: "WEB" | "PWA" | "BOTH";
  audience: "ALL_MEMBERS" | "SPECIFIC";
  maxDeviceGb: number;
  groups: { groupId: string; group: { name: string } }[];
  users: { userId: string; user: { email: string } }[];
};

const PLATFORMS = [
  { value: "BOTH", label: "Web and installed app", hint: "Downloading is offered everywhere." },
  { value: "PWA", label: "Installed app only", hint: "The button is hidden in an ordinary browser tab." },
  { value: "WEB", label: "Web only", hint: "The button is hidden inside the installed app." },
] as const;

/**
 * Site-wide download settings. What *may* be downloaded is set per
 * category/series/video on those items' own edit pages — this page is the
 * feature switch, who it applies to, and where it shows up.
 */
export default function DownloadsAdminPage() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [emails, setEmails] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [policyRes, groupsRes] = await Promise.all([
        fetch("/api/admin/downloads"),
        fetch("/api/admin/permission-groups"),
      ]);
      if (policyRes.ok) {
        const loaded: Policy = await policyRes.json();
        setPolicy(loaded);
        setEmails(loaded.users.map((u) => u.user.email).join(", "));
      } else {
        setError((await policyRes.json()).error ?? "Failed to load download settings");
      }
      if (groupsRes.ok) setGroups(await groupsRes.json());
    })();
  }, []);

  async function save(change: Partial<Policy> & { groupIds?: string[]; userEmails?: string[] }) {
    if (!policy) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/downloads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setPolicy(data);
      setStatus(
        data.unknownEmails?.length
          ? `Saved. No account yet for: ${data.unknownEmails.join(", ")} — add them under Access first.`
          : "Saved.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!policy) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Downloads</h1>
        <p className="text-sm text-zinc-500">{error ?? "Loading…"}</p>
      </div>
    );
  }

  const selectedGroupIds = policy.groups.map((g) => g.groupId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Downloads</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Offline downloads for members. Turn the feature on or off under{" "}
          <a href="/admin/plugins" className="underline">
            Plugins
          </a>
          ; choose which videos can be downloaded on each category, series, or video&apos;s own page.
        </p>
      </div>

      <section className="space-y-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-medium">Where downloads are offered</h2>
        {PLATFORMS.map((option) => (
          <label key={option.value} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="platform"
              className="mt-1"
              checked={policy.platform === option.value}
              onChange={() => save({ platform: option.value })}
            />
            <span>
              {option.label}
              <span className="block text-xs text-zinc-500">{option.hint}</span>
            </span>
          </label>
        ))}
        <p className="text-xs text-zinc-500">
          The installed app is the better home for downloads: files are kept by the app and play with no
          connection at all.
        </p>
      </section>

      <section className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-medium">Who can download</h2>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="audience"
            className="mt-1"
            checked={policy.audience === "ALL_MEMBERS"}
            onChange={() => save({ audience: "ALL_MEMBERS" })}
          />
          <span>
            Any member
            <span className="block text-xs text-zinc-500">
              Everyone who can watch something can also download it.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="audience"
            className="mt-1"
            checked={policy.audience === "SPECIFIC"}
            onChange={() => save({ audience: "SPECIFIC" })}
          />
          <span>
            Only certain groups or people
            <span className="block text-xs text-zinc-500">Admins can always download.</span>
          </span>
        </label>

        {policy.audience === "SPECIFIC" && (
          <div className="space-y-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <div>
              <p className="text-sm font-medium">Permission groups</p>
              {groups.length === 0 ? (
                <p className="mt-1 text-xs text-zinc-500">
                  No groups yet — create one under{" "}
                  <a href="/admin/permissions" className="underline">
                    Permissions
                  </a>
                  .
                </p>
              ) : (
                <div className="mt-1 space-y-1">
                  {groups.map((group) => (
                    <label key={group.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedGroupIds.includes(group.id)}
                        onChange={(e) =>
                          save({
                            groupIds: e.target.checked
                              ? [...selectedGroupIds, group.id]
                              : selectedGroupIds.filter((id) => id !== group.id),
                          })
                        }
                      />
                      {group.name}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="download-emails" className="block text-sm font-medium">
                Specific people
              </label>
              <textarea
                id="download-emails"
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                onBlur={() =>
                  save({
                    userEmails: emails
                      .split(/[\s,;]+/)
                      .map((email) => email.trim().toLowerCase())
                      .filter((email) => email.includes("@")),
                  })
                }
                rows={2}
                placeholder="someone@example.com, another@example.com"
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <p className="mt-1 text-xs text-zinc-500">Saved when you click away from the box.</p>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-2 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-medium">Suggested storage limit per device</h2>
        <div className="flex items-center gap-2 text-sm">
          <input
            type="number"
            min={1}
            max={512}
            value={policy.maxDeviceGb}
            onChange={(e) => setPolicy({ ...policy, maxDeviceGb: Number(e.target.value) })}
            onBlur={() => save({ maxDeviceGb: policy.maxDeviceGb })}
            className="w-24 rounded-md border border-zinc-300 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <span>GB</span>
        </div>
        <p className="text-xs text-zinc-500">
          Shown to members in their profile as a guide. Advisory only — the browser&apos;s own storage quota is the
          real limit, and this never interrupts a download in progress.
        </p>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {status && !error && <p className="text-sm text-green-600">{status}</p>}
      {saving && <p className="text-sm text-zinc-500">Saving…</p>}
    </div>
  );
}
