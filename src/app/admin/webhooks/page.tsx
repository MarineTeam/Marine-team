"use client";

import { useEffect, useState } from "react";
import {
  BulkBar,
  BulkButton,
  BulkCheckbox,
  BulkSelectAll,
  bulkFetch,
  runBulk,
  useBulkSelect,
} from "@/components/bulk-select";

type Webhook = { id: string; url: string; secret: string | null; active: boolean; createdAt: string };

export default function WebhooksAdminPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bulk = useBulkSelect(webhooks.map((w) => w.id));

  async function bulkPatch(body: Record<string, unknown>) {
    setBusy(true);
    await runBulk(bulk.selected, (id) =>
      bulkFetch(`/api/admin/webhooks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    bulk.clear();
    setBusy(false);
    await load();
  }

  async function bulkDelete() {
    if (!confirm(`Delete ${bulk.count} webhook${bulk.count === 1 ? "" : "s"}?`)) return;
    setBusy(true);
    await runBulk(bulk.selected, (id) => bulkFetch(`/api/admin/webhooks/${id}`, { method: "DELETE" }));
    bulk.clear();
    setBusy(false);
    await load();
  }

  async function load() {
    const res = await fetch("/api/admin/webhooks");
    if (res.ok) setWebhooks(await res.json());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch("/api/admin/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, secret: secret.trim() || undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to add webhook");
      setUrl("");
      setSecret("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add webhook");
    }
  }

  async function toggle(w: Webhook) {
    await fetch(`/api/admin/webhooks/${w.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !w.active }),
    });
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this webhook?")) return;
    await fetch(`/api/admin/webhooks/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Webhooks</h1>
        <p className="text-sm text-zinc-500">
          Posts a JSON payload to each active URL below when a series or video is published.
          Requires the Webhooks plugin to be enabled in{" "}
          <a href="/admin/plugins" className="underline">
            Plugins
          </a>
          . Set a secret to sign the request body as an{" "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">X-Webhook-Signature</code>{" "}
          header (hex HMAC-SHA256).
        </p>
      </div>

      <form onSubmit={create} className="flex flex-wrap gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/webhook"
          className="min-w-[16rem] flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          required
        />
        <input
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="Secret (optional)"
          className="min-w-[10rem] rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
        >
          Add
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {webhooks.length > 0 && (
        <BulkSelectAll allSelected={bulk.allSelected} onToggle={bulk.toggleAll} disabled={busy} />
      )}

      <BulkBar count={bulk.count} onClear={bulk.clear} busy={busy}>
        <BulkButton onClick={() => bulkPatch({ active: true })}>Activate</BulkButton>
        <BulkButton onClick={() => bulkPatch({ active: false })}>Deactivate</BulkButton>
        <BulkButton danger onClick={bulkDelete}>
          Delete
        </BulkButton>
      </BulkBar>

      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
        {webhooks.map((w) => (
          <li key={w.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div className="flex min-w-0 items-center gap-2">
              <BulkCheckbox
                checked={bulk.isSelected(w.id)}
                onToggle={(shift) => bulk.toggle(w.id, shift)}
                label={w.url}
              />
              <div className="min-w-0">
              <p className="truncate font-mono text-sm">{w.url}</p>
              <p className="text-xs text-zinc-400">
                {w.secret ? "Signed" : "Unsigned"} · added {new Date(w.createdAt).toLocaleDateString()}
              </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={() => toggle(w)}
                className={`rounded-md border px-2 py-1 dark:border-zinc-700 ${w.active ? "border-amber-400 text-amber-700 dark:text-amber-400" : ""}`}
              >
                {w.active ? "Active" : "Inactive"}
              </button>
              <button onClick={() => remove(w.id)} className="text-red-600 hover:underline">
                Delete
              </button>
            </div>
          </li>
        ))}
        {webhooks.length === 0 && <li className="p-4 text-sm text-zinc-500">No webhooks yet.</li>}
      </ul>
    </div>
  );
}
