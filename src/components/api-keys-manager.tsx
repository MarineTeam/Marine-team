"use client";

import { useEffect, useState } from "react";

type Scope = { scope: string; label: string; description: string; personal: boolean };
type Key = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdByEmail: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  state: "ok" | "revoked" | "expired";
};

/**
 * Making and revoking keys.
 *
 * The whole screen is built around one fact: **the key is on screen once and
 * then it is gone.** So a new key gets its own panel rather than a line in the
 * table, it stays there until it is dismissed, and dismissing it says what
 * that means. Everything else here — the prefix, the last-used date — exists
 * so that the list is still useful once the secret isn't in it.
 */
export function ApiKeysManager() {
  const [keys, setKeys] = useState<Key[]>([]);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [expiresOn, setExpiresOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    const response = await fetch("/api/admin/api-keys");
    if (response.ok) {
      const data = (await response.json()) as { keys: Key[]; scopes: Scope[] };
      setKeys(data.keys);
      setScopes(data.scopes);
    }
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function create(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scopes: chosen, expiresOn: expiresOn || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Couldn't make a key.");
      setFresh(data.key);
      setCopied(false);
      setName("");
      setChosen([]);
      setExpiresOn("");
      await load();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Couldn't make a key.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(key: Key) {
    if (!confirm(`Turn off "${key.name}"?\n\nAnything using it stops working straight away. This can't be undone — a replacement is a new key.`)) {
      return;
    }
    const response = await fetch(`/api/admin/api-keys/${key.id}`, { method: "DELETE" });
    if (response.ok) await load();
  }

  return (
    <div className="space-y-6">
      {fresh && (
        <div className="space-y-2 rounded-lg border border-green-300 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/40">
          <h2 className="text-sm font-medium text-green-800 dark:text-green-300">
            Here is the key. This is the only time it will be shown.
          </h2>
          <input
            readOnly
            value={fresh}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-md border border-sep bg-white px-3 py-2 font-mono text-xs dark:bg-black"
          />
          <p className="text-xs text-sec">
            Nothing here can show it again — only its fingerprint is stored. Copy it into the system that needs it now;
            if it is lost, make another and turn this one off.
          </p>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(fresh);
                  setCopied(true);
                } catch {
                  setError("Couldn't copy — select the key and copy it yourself.");
                }
              }}
              className="rounded-md border border-sep px-3 py-1.5 text-sm hover:bg-hover"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button onClick={() => setFresh(null)} className="rounded-md border border-sep px-3 py-1.5 text-sm hover:bg-hover">
              I&apos;ve saved it
            </button>
          </div>
        </div>
      )}

      <form onSubmit={create} className="space-y-3 rounded-lg border border-sep p-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="block text-sec">What is it for?</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Foyer noticeboard"
              className="mt-1 w-64 rounded-md border border-sep px-3 py-1.5"
            />
          </label>
          <label className="text-sm">
            <span className="block text-sec">Expires (optional)</span>
            <input
              type="date"
              value={expiresOn}
              onChange={(e) => setExpiresOn(e.target.value)}
              className="mt-1 rounded-md border border-sep px-3 py-1.5"
            />
          </label>
        </div>

        <fieldset className="space-y-1">
          <legend className="text-sm text-sec">What may it read?</legend>
          {scopes.map((scope) => (
            <label key={scope.scope} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={chosen.includes(scope.scope)}
                onChange={(e) =>
                  setChosen((was) => (e.target.checked ? [...was, scope.scope] : was.filter((s) => s !== scope.scope)))
                }
                className="mt-1"
              />
              <span>
                <span className="font-medium text-ink">{scope.label}</span>
                {/* Said loudly, because a form that describes "events" and
                    "everyone's phone number" in the same tone gets both
                    ticked without thinking. */}
                {scope.personal && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    personal data
                  </span>
                )}
                <span className="block text-xs text-sec">{scope.description}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={busy || chosen.length === 0}
            className="btn-primary rounded-md px-3 py-1.5 text-sm text-white disabled:opacity-60"
          >
            {busy ? "Making…" : "Make a key"}
          </button>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </form>

      {loaded && keys.length === 0 ? (
        <p className="rounded-lg border border-dashed border-sep p-8 text-center text-sm text-sec">No keys yet.</p>
      ) : (
        <ul className="divide-y divide-sep rounded-lg border border-sep">
          {keys.map((key) => (
            <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {key.name}
                  {key.state === "revoked" && <span className="text-sec"> · off</span>}
                  {key.state === "expired" && <span className="text-sec"> · expired</span>}
                </p>
                <p className="font-mono text-xs text-sec">{key.prefix}…</p>
                <p className="text-xs text-ter">
                  {key.scopes.join(", ") || "nothing"} · made by {key.createdByEmail} ·{" "}
                  {key.lastUsedAt ? `last used ${new Date(key.lastUsedAt).toLocaleDateString("en-GB")}` : "never used"}
                  {key.expiresAt && ` · expires ${new Date(key.expiresAt).toLocaleDateString("en-GB")}`}
                </p>
              </div>
              {key.state !== "revoked" && (
                <button
                  onClick={() => revoke(key)}
                  className="shrink-0 rounded-md border border-sep px-3 py-1.5 text-xs hover:bg-hover"
                >
                  Turn it off
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
