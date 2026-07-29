"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ProfileForm({
  currentDisplayName,
  notificationsOn,
  currentNotificationFrequency,
  currentEmailNotifications,
}: {
  currentDisplayName: string | null;
  notificationsOn: boolean;
  currentNotificationFrequency: "INSTANT" | "DAILY";
  currentEmailNotifications: boolean;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(currentDisplayName ?? "");
  const [notificationFrequency, setNotificationFrequency] = useState(currentNotificationFrequency);
  const [emailNotifications, setEmailNotifications] = useState(currentEmailNotifications);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim() || null,
          notificationFrequency,
          emailNotifications,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save");
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div>
        <label htmlFor="displayName" className="block text-sm font-medium">
          Display name
        </label>
        <input
          id="displayName"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={50}
          placeholder="How your name appears on comments"
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <p className="mt-1 text-xs text-zinc-500">Leave blank to use your account name instead.</p>
      </div>
      {notificationsOn && (
        <div>
          <label htmlFor="notificationFrequency" className="block text-sm font-medium">
            Notification frequency
          </label>
          <select
            id="notificationFrequency"
            value={notificationFrequency}
            onChange={(e) => setNotificationFrequency(e.target.value as "INSTANT" | "DAILY")}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="INSTANT">Instant — right when it&apos;s published</option>
            <option value="DAILY">Daily digest — one summary a day</option>
          </select>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={emailNotifications}
              onChange={(e) => setEmailNotifications(e.target.checked)}
            />
            Also email me when new content publishes
          </label>
          <p className="mt-1 text-xs text-zinc-500">
            Email always sends immediately, regardless of your push frequency above.
          </p>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && !error && <p className="text-sm text-green-600">Saved.</p>}
      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-zinc-900 text-white px-4 py-1.5 text-sm hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
