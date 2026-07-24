"use client";

import { useState } from "react";

type SetupResult = {
  applied: string[];
  skipped: string[];
  seeded: boolean;
};

export default function DemoSetupPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SetupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSetup() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/demo/setup", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Setup failed");
      setResult(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold">Demo Setup</h1>
        <p className="text-sm text-zinc-500 mt-1">
          The <code>/demo</code> section browses a separate database (
          <code>DEMO_DATABASE_URL</code>) so simulated content can never end up mixed into your
          real church&apos;s data. Run this once after setting that env var to create its schema
          and seed demo content — safe to run again later, it skips anything already there.
        </p>
      </div>

      <button
        onClick={runSetup}
        disabled={loading}
        className="rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
      >
        {loading ? "Running…" : "Run demo setup"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 text-sm space-y-2">
          <p>
            {result.seeded ? "Demo content seeded." : "Demo content already existed — skipped."}
          </p>
          <p className="text-zinc-500">
            {result.applied.length} schema statement(s) applied, {result.skipped.length} already
            existed.
          </p>
          <p>
            <a href="/demo" target="_blank" className="underline" rel="noopener noreferrer">
              View the demo →
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
