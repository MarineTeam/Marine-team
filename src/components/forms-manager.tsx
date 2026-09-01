"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type AdminForm = {
  id: string;
  slug: string;
  title: string;
  published: boolean;
  questions: number;
  submissions: number;
};

export function FormsManager() {
  const [forms, setForms] = useState<AdminForm[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/admin/forms");
    if (response.ok) setForms((await response.json()).forms);
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
      const response = await fetch("/api/admin/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Couldn't create that.");
      setTitle("");
      await load();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Couldn't create that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={create} className="flex flex-wrap items-end gap-2 rounded-lg border border-sep p-3">
        <label className="text-sm">
          <span className="block text-sec">Name</span>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Connect card"
            className="mt-1 rounded-md border border-sep px-3 py-1.5"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="btn-primary rounded-md px-3 py-1.5 text-sm text-white disabled:opacity-60"
        >
          {busy ? "Adding…" : "New form"}
        </button>
        {error && <p className="w-full text-xs text-red-600">{error}</p>}
      </form>

      {loaded && forms.length === 0 ? (
        <p className="rounded-lg border border-dashed border-sep p-8 text-center text-sm text-sec">
          No forms yet.
        </p>
      ) : (
        <ul className="divide-y divide-sep rounded-lg border border-sep">
          {forms.map((form) => (
            <li key={form.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <Link href={`/admin/forms/${form.id}`} className="text-sm font-medium hover:underline">
                  {form.title}
                </Link>
                <p className="text-xs text-sec">
                  /forms/{form.slug}
                  {!form.published && " · draft"}
                </p>
              </div>
              <p className="shrink-0 text-right text-xs text-sec">
                <span className="block">
                  {form.submissions} {form.submissions === 1 ? "response" : "responses"}
                </span>
                <span className="block text-ter">
                  {form.questions} {form.questions === 1 ? "question" : "questions"}
                </span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
