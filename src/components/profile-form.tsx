"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ProfileForm({
  currentDisplayName,
  profilesOn,
  notificationsOn,
  currentNotificationFrequency,
  currentEmailNotifications,
  currentPhone,
  currentSmsOptIn,
  currentBroadcastEmails,
}: {
  currentDisplayName: string | null;
  profilesOn: boolean;
  notificationsOn: boolean;
  currentNotificationFrequency: "INSTANT" | "DAILY";
  currentEmailNotifications: boolean;
  currentPhone: string | null;
  currentSmsOptIn: boolean;
  currentBroadcastEmails: boolean;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(currentDisplayName ?? "");
  const [notificationFrequency, setNotificationFrequency] = useState(currentNotificationFrequency);
  const [emailNotifications, setEmailNotifications] = useState(currentEmailNotifications);
  const [phone, setPhone] = useState(currentPhone ?? "");
  const [smsOptIn, setSmsOptIn] = useState(currentSmsOptIn);
  const [broadcastEmails, setBroadcastEmails] = useState(currentBroadcastEmails);
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
          phone: phone.trim() || null,
          smsOptIn,
          broadcastEmails,
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
      {/* Gated on the Profiles plugin, which is what the PATCH route honours
          too: with it off, a saved display name is simply left alone rather
          than shown as an editable field that wouldn't take. */}
      {profilesOn && (
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
            className="mt-1 w-full rounded-md border border-sep px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-sec">Leave blank to use your account name instead.</p>
        </div>
      )}
      {notificationsOn && (
        <div>
          <label htmlFor="notificationFrequency" className="block text-sm font-medium">
            Notification frequency
          </label>
          <select
            id="notificationFrequency"
            value={notificationFrequency}
            onChange={(e) => setNotificationFrequency(e.target.value as "INSTANT" | "DAILY")}
            className="mt-1 w-full rounded-md border border-sep px-3 py-2 text-sm"
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
          <p className="mt-1 text-xs text-sec">
            Email always sends immediately, regardless of your push frequency above.
          </p>
        </div>
      )}
      {/* Church-wide announcements, which are a different thing from "a new
          sermon is up" and so are not behind the Notifications plugin. */}
      <div className="space-y-2 border-t border-sep pt-3">
        <p className="text-sm font-medium">Announcements from the church</p>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={broadcastEmails}
            onChange={(e) => setBroadcastEmails(e.target.checked)}
          />
          <span>
            Email me
            <span className="block text-xs text-sec">
              Things like a cancelled service or a change of time. Turning this off means you
              won&apos;t hear about those.
            </span>
          </span>
        </label>

        <label className="block text-sm">
          Mobile number
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+44 7700 900123"
            className="mt-1 w-full rounded-md border border-sep px-3 py-2 text-sm"
          />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={smsOptIn}
            disabled={!phone.trim()}
            onChange={(e) => setSmsOptIn(e.target.checked)}
          />
          <span>
            Text me for urgent things
            <span className="block text-xs text-sec">
              Off unless you say so, and only ever for something that can&apos;t wait.
            </span>
          </span>
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && !error && <p className="text-sm text-green-600">Saved.</p>}
      <button
        type="submit"
        disabled={saving}
        className="rounded-md btn-primary text-white px-4 py-1.5 text-sm disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
