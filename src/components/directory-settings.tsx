"use client";

import { useState } from "react";

/**
 * Whether somebody appears in the members' directory.
 *
 * Three separate switches rather than one, because they are three separate
 * decisions: being findable by name is not the same as publishing an email,
 * which is not the same as publishing a phone number. Turning the first one off
 * hides the other two, since there is nothing for them to attach to.
 */
export function DirectorySettings({
  listed: initialListed,
  showEmail: initialEmail,
  showPhone: initialPhone,
  note: initialNote,
  hasPhone,
}: {
  listed: boolean;
  showEmail: boolean;
  showPhone: boolean;
  note: string | null;
  hasPhone: boolean;
}) {
  const [listed, setListed] = useState(initialListed);
  const [showEmail, setShowEmail] = useState(initialEmail);
  const [showPhone, setShowPhone] = useState(initialPhone);
  const [note, setNote] = useState(initialNote ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(patch: Record<string, unknown>) {
    setError(null);
    setSaved(false);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: null, ...patch }),
      });
      if (!response.ok) throw new Error("Couldn't save that");
      setSaved(true);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Couldn't save that");
    }
  }

  return (
    <div className="rounded-lg border border-sep p-4">
      <h3 className="text-sm font-medium text-ink">Member directory</h3>
      <p className="mt-1 text-xs text-sec">
        Other signed-in members can look you up. Nothing here is on unless you turn it on, and turning the first one
        off takes the rest with it.
      </p>

      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={listed}
          onChange={(e) => {
            const on = e.target.checked;
            setListed(on);
            if (!on) {
              setShowEmail(false);
              setShowPhone(false);
            }
            void save({ directoryListed: on });
          }}
        />
        List me by name
      </label>

      {listed && (
        <div className="mt-2 space-y-2 border-l-2 border-sep pl-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showEmail}
              onChange={(e) => {
                setShowEmail(e.target.checked);
                void save({ directoryListed: true, directoryShowEmail: e.target.checked });
              }}
            />
            Show my email address
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showPhone}
              disabled={!hasPhone}
              onChange={(e) => {
                setShowPhone(e.target.checked);
                void save({ directoryListed: true, directoryShowPhone: e.target.checked });
              }}
            />
            Show my phone number
            {!hasPhone && <span className="text-xs text-ter">— add one above first</span>}
          </label>
          <label className="block text-sm">
            <span className="block text-sec">Anything to add? (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => void save({ directoryListed: true, directoryNote: note })}
              placeholder="Ask me about the youth group"
              maxLength={200}
              className="mt-1 w-full rounded-md border border-sep px-3 py-1.5"
            />
          </label>
        </div>
      )}

      {saved && <p className="mt-2 text-xs text-green-700 dark:text-green-400">Saved.</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
