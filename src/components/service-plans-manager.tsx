"use client";

import { useCallback, useEffect, useState } from "react";

type PlannableFile = {
  id: string;
  title: string;
  pageNumber: number | null;
  context: string | null;
  /** A whole book takes a hymn number; a hymn that is its own file already is one. */
  wholeBook: boolean;
};

type PlanItem = {
  fileId: string;
  hymnNumber: number | null;
  note: string | null;
  file?: { id: string; title: string; pageNumber: number | null };
};

type Plan = {
  id: string;
  title: string;
  serviceDate: string | null;
  notes: string | null;
  published: boolean;
  items: PlanItem[];
};

/** yyyy-mm-dd for a date input, from whatever the API sent back. */
function dateValue(iso: string | null): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : "";
}

/**
 * Builds the running order for a service.
 *
 * The list of hymns is edited here and saved whole (see the PATCH route):
 * six hymns in an order is one thing, and replacing it beats reconciling it.
 * Everything else on a plan — its title, its day, whether members can see it
 * yet — saves with the same button.
 */
export function ServicePlansManager() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [files, setFiles] = useState<PlannableFile[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Plan | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/services");
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't load service plans");
      return;
    }
    const data = await res.json();
    setPlans(data.plans);
    setFiles(data.files);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function create() {
    if (!newTitle.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), serviceDate: newDate || null }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't create that plan");
      setNewTitle("");
      setNewDate("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create that plan");
    } finally {
      setBusy(false);
    }
  }

  function edit(plan: Plan) {
    setEditingId(plan.id === editingId ? null : plan.id);
    setDraft({ ...plan, items: plan.items.map((item) => ({ ...item })) });
    setPick("");
    setError(null);
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/services/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          serviceDate: draft.serviceDate,
          notes: draft.notes,
          published: draft.published,
          items: draft.items.map((item) => ({
            fileId: item.fileId,
            hymnNumber: item.hymnNumber,
            note: item.note,
          })),
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't save that plan");
      setEditingId(null);
      setDraft(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that plan");
    } finally {
      setBusy(false);
    }
  }

  async function remove(plan: Plan) {
    if (!window.confirm(`Delete "${plan.title}"? The hymns themselves aren't touched.`)) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/services/${plan.id}`, { method: "DELETE" });
      if (editingId === plan.id) {
        setEditingId(null);
        setDraft(null);
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  function addItem(fileId: string) {
    const file = files.find((candidate) => candidate.id === fileId);
    if (!draft || !file) return;
    setDraft({
      ...draft,
      items: [
        ...draft.items,
        { fileId, hymnNumber: null, note: null, file: { id: file.id, title: file.title, pageNumber: file.pageNumber } },
      ],
    });
    setPick("");
  }

  function updateItem(index: number, change: Partial<PlanItem>) {
    if (!draft) return;
    const items = draft.items.map((item, at) => (at === index ? { ...item, ...change } : item));
    setDraft({ ...draft, items });
  }

  function moveItem(index: number, by: -1 | 1) {
    if (!draft) return;
    const to = index + by;
    if (to < 0 || to >= draft.items.length) return;
    const items = [...draft.items];
    [items[index], items[to]] = [items[to], items[index]];
    setDraft({ ...draft, items });
  }

  function removeItem(index: number) {
    if (!draft) return;
    setDraft({ ...draft, items: draft.items.filter((_, at) => at !== index) });
  }

  const fileById = new Map(files.map((file) => [file.id, file]));

  return (
    <div className="space-y-6">
      <section className="space-y-2 rounded-lg border border-sep p-4">
        <h2 className="text-sm font-medium">New service</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Sunday morning"
            className="min-w-48 flex-1 rounded-md border border-sep px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            aria-label="Service date"
            className="rounded-md border border-sep px-3 py-2 text-sm"
          />
          <button
            onClick={create}
            disabled={busy || !newTitle.trim()}
            className="rounded-md btn-primary px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Create
          </button>
        </div>
        <p className="text-xs text-sec">
          A new plan starts unpublished, so the order can be worked out before anybody sees it.
        </p>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="space-y-3">
        {plans.map((plan) => (
          <li key={plan.id} className="rounded-lg border border-sep p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{plan.title}</p>
                <p className="text-xs text-sec">
                  {[
                    plan.serviceDate
                      ? new Date(plan.serviceDate).toLocaleDateString(undefined, {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                        })
                      : "No date",
                    `${plan.items.length} ${plan.items.length === 1 ? "hymn" : "hymns"}`,
                    plan.published ? "Published" : "Draft",
                  ].join(" · ")}
                </p>
              </div>
              <button onClick={() => edit(plan)} className="rounded-md border border-sep px-2 py-1 text-xs">
                {editingId === plan.id ? "Close" : "Edit"}
              </button>
              <button onClick={() => remove(plan)} className="text-xs text-red-600 hover:underline">
                Delete
              </button>
            </div>

            {editingId === plan.id && draft && (
              <div className="mt-3 space-y-3 rounded-md border border-sep bg-chip p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="space-y-1 text-xs">
                    <span className="text-sec">Title</span>
                    <input
                      value={draft.title}
                      onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                      className="w-full rounded-md border border-sep px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="text-sec">Date</span>
                    <input
                      type="date"
                      value={dateValue(draft.serviceDate)}
                      onChange={(e) =>
                        setDraft({ ...draft, serviceDate: e.target.value ? e.target.value : null })
                      }
                      className="w-full rounded-md border border-sep px-2 py-1.5 text-sm"
                    />
                  </label>
                </div>

                <label className="block space-y-1 text-xs">
                  <span className="text-sec">Notes (shown above the list)</span>
                  <textarea
                    value={draft.notes ?? ""}
                    onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                    rows={2}
                    className="w-full rounded-md border border-sep px-2 py-1.5 text-sm"
                  />
                </label>

                <ol className="space-y-2">
                  {draft.items.map((item, index) => {
                    const file = fileById.get(item.fileId);
                    return (
                      <li key={`${item.fileId}-${index}`} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="w-4 text-right text-xs text-ter">{index + 1}</span>
                        <span className="min-w-0 flex-1 truncate">
                          {file?.title ?? item.file?.title ?? "(removed file)"}
                          {file?.context && <span className="text-xs text-sec"> · {file.context}</span>}
                        </span>
                        {/* Only a whole book needs one: a hymn that is its own
                            file is already the hymn. */}
                        {file?.wholeBook !== false && (
                          <input
                            type="number"
                            value={item.hymnNumber ?? ""}
                            onChange={(e) =>
                              updateItem(index, {
                                hymnNumber: e.target.value ? Number(e.target.value) : null,
                              })
                            }
                            placeholder="No."
                            aria-label="Hymn number"
                            className="w-16 rounded border border-sep px-1.5 py-1 text-center"
                          />
                        )}
                        <input
                          value={item.note ?? ""}
                          onChange={(e) => updateItem(index, { note: e.target.value })}
                          placeholder="Note"
                          aria-label="Note"
                          className="w-32 rounded border border-sep px-1.5 py-1"
                        />
                        <button
                          onClick={() => moveItem(index, -1)}
                          disabled={index === 0}
                          aria-label="Move up"
                          className="rounded border border-sep px-1.5 py-1 text-xs disabled:opacity-40"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveItem(index, 1)}
                          disabled={index === draft.items.length - 1}
                          aria-label="Move down"
                          className="rounded border border-sep px-1.5 py-1 text-xs disabled:opacity-40"
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => removeItem(index)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      </li>
                    );
                  })}
                  {draft.items.length === 0 && (
                    <li className="text-xs text-sec">Nothing in this service yet.</li>
                  )}
                </ol>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={pick}
                    onChange={(e) => addItem(e.target.value)}
                    aria-label="Add a hymn or book"
                    className="max-w-full rounded-md border border-sep px-2 py-1.5 text-sm"
                  >
                    <option value="">Add a hymn or book…</option>
                    {files.map((file) => (
                      <option key={file.id} value={file.id}>
                        {file.pageNumber ? `${file.pageNumber}. ` : ""}
                        {file.title}
                        {file.context ? ` — ${file.context}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={save}
                    disabled={busy}
                    className="rounded-md btn-primary px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    {busy ? "Saving…" : "Save"}
                  </button>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.published}
                      onChange={(e) => setDraft({ ...draft, published: e.target.checked })}
                    />
                    Published — members can see this
                  </label>
                </div>
              </div>
            )}
          </li>
        ))}
        {plans.length === 0 && <li className="text-sm text-sec">No service plans yet.</li>}
      </ul>
    </div>
  );
}
