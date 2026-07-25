"use client";

import { useEffect, useState } from "react";

type User = {
  id: string;
  email: string;
  name: string | null;
  role: "MEMBER" | "ADMIN";
  auth0Id: string | null;
  authorized: boolean;
};

type Category = { id: string; name: string };
type Series = { id: string; title: string };
type CategoryEditor = { id: string; user: User; category: Category };
type SeriesEditor = { id: string; user: User; series: Series };

export default function UsersAdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [categoryEditors, setCategoryEditors] = useState<CategoryEditor[]>([]);
  const [seriesEditors, setSeriesEditors] = useState<SeriesEditor[]>([]);
  const [editorEmail, setEditorEmail] = useState("");
  const [editorCategoryId, setEditorCategoryId] = useState("");
  const [editorSeriesId, setEditorSeriesId] = useState("");
  const [editorError, setEditorError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/users");
    if (res.ok) setUsers(await res.json());
  }

  async function loadEditors() {
    const [categoriesRes, seriesRes, editorsRes] = await Promise.all([
      fetch("/api/admin/categories"),
      fetch("/api/admin/series"),
      fetch("/api/admin/editors"),
    ]);
    if (categoriesRes.ok) setCategories(await categoriesRes.json());
    if (seriesRes.ok) setSeriesList(await seriesRes.json());
    if (editorsRes.ok) {
      const data = await editorsRes.json();
      setCategoryEditors(data.categoryEditors);
      setSeriesEditors(data.seriesEditors);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    loadEditors();
  }, []);

  async function addCategoryEditor(e: React.FormEvent) {
    e.preventDefault();
    setEditorError(null);
    try {
      const res = await fetch("/api/admin/editors/category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userEmail: editorEmail, categoryId: editorCategoryId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to add editor");
      setEditorEmail("");
      setEditorCategoryId("");
      await loadEditors();
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : "Failed to add editor");
    }
  }

  async function addSeriesEditor(e: React.FormEvent) {
    e.preventDefault();
    setEditorError(null);
    try {
      const res = await fetch("/api/admin/editors/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userEmail: editorEmail, seriesId: editorSeriesId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to add editor");
      setEditorEmail("");
      setEditorSeriesId("");
      await loadEditors();
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : "Failed to add editor");
    }
  }

  async function removeCategoryEditor(id: string) {
    await fetch(`/api/admin/editors/category/${id}`, { method: "DELETE" });
    await loadEditors();
  }

  async function removeSeriesEditor(id: string) {
    await fetch(`/api/admin/editors/series/${id}`, { method: "DELETE" });
    await loadEditors();
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to add");
      setEmail("");
      setRole("MEMBER");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setLoading(false);
    }
  }

  async function update(id: string, data: Partial<Pick<User, "role" | "authorized">>) {
    setError(null);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) setError((await res.json()).error ?? "Failed to update");
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Remove this record entirely? They'll show up again if they try to log in.")) {
      return;
    }
    setError(null);
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json()).error ?? "Failed to remove");
    await load();
  }

  const pending = users.filter((u) => !u.authorized);
  const authorized = users.filter((u) => u.authorized);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Access</h1>
        <p className="text-sm text-zinc-500">
          Only authorized emails (or emails in the <code>ADMIN_EMAILS</code> env var) can log in.
          Anyone else who attempts to log in shows up below as pending — you decide whether to
          grant them access.
        </p>
      </div>

      <form
        onSubmit={addUser}
        className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4"
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="person@example.com"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          required
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "MEMBER" | "ADMIN")}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="MEMBER">Member</option>
          <option value="ADMIN">Admin</option>
        </select>
        <button
          type="submit"
          disabled={loading}
          className="ml-auto rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
        >
          Pre-authorize
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="space-y-3">
        <h2 className="font-medium">
          Pending login attempts {pending.length > 0 && `(${pending.length})`}
        </h2>
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
          {pending.map((u) => (
            <li key={u.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
              <div className="min-w-0">
                <p className="font-medium">{u.name ?? u.email}</p>
                <p className="text-sm text-zinc-500">{u.email} · tried to log in</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <button
                  onClick={() => update(u.id, { authorized: true })}
                  className="rounded-md bg-zinc-900 text-white px-3 py-1.5 dark:bg-white dark:text-zinc-900"
                >
                  Grant access
                </button>
                <button onClick={() => remove(u.id)} className="text-red-600 hover:underline">
                  Dismiss
                </button>
              </div>
            </li>
          ))}
          {pending.length === 0 && (
            <li className="p-4 text-sm text-zinc-500">No pending login attempts.</li>
          )}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Authorized</h2>
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
          {authorized.map((u) => (
            <li key={u.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
              <div className="min-w-0">
                <p className="font-medium">{u.name ?? u.email}</p>
                <p className="text-sm text-zinc-500">
                  {u.email} · {u.auth0Id ? "has logged in" : "invited, not yet logged in"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <select
                  value={u.role}
                  onChange={(e) => update(u.id, { role: e.target.value as "MEMBER" | "ADMIN" })}
                  className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="MEMBER">Member</option>
                  <option value="ADMIN">Admin</option>
                </select>
                <button
                  onClick={() => update(u.id, { authorized: false })}
                  className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
                >
                  Revoke
                </button>
                <button onClick={() => remove(u.id)} className="text-red-600 hover:underline">
                  Delete
                </button>
              </div>
            </li>
          ))}
          {authorized.length === 0 && (
            <li className="p-4 text-sm text-zinc-500">No authorized users yet.</li>
          )}
        </ul>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-medium">Content editors</h2>
          <p className="text-sm text-zinc-500">
            Grant an already-authorized user editor access to one category (and everything under
            it) or one specific series, without making them a site-wide admin.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <form
            onSubmit={addCategoryEditor}
            className="space-y-2 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4"
          >
            <p className="text-sm font-medium">Category editor</p>
            <input
              type="email"
              value={editorEmail}
              onChange={(e) => setEditorEmail(e.target.value)}
              placeholder="person@example.com"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              required
            />
            <select
              value={editorCategoryId}
              onChange={(e) => setEditorCategoryId(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              required
            >
              <option value="">Choose a category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="w-full rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
            >
              Add category editor
            </button>
          </form>

          <form
            onSubmit={addSeriesEditor}
            className="space-y-2 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4"
          >
            <p className="text-sm font-medium">Series editor</p>
            <input
              type="email"
              value={editorEmail}
              onChange={(e) => setEditorEmail(e.target.value)}
              placeholder="person@example.com"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              required
            />
            <select
              value={editorSeriesId}
              onChange={(e) => setEditorSeriesId(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              required
            >
              <option value="">Choose a series…</option>
              {seriesList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="w-full rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
            >
              Add series editor
            </button>
          </form>
        </div>
        {editorError && <p className="text-sm text-red-600">{editorError}</p>}

        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
          {categoryEditors.map((editor) => (
            <li
              key={editor.id}
              className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4"
            >
              <p className="text-sm">
                <span className="font-medium">{editor.user.email}</span> — category{" "}
                <span className="font-medium">{editor.category.name}</span>
              </p>
              <button
                onClick={() => removeCategoryEditor(editor.id)}
                className="text-sm text-red-600 hover:underline"
              >
                Revoke
              </button>
            </li>
          ))}
          {seriesEditors.map((editor) => (
            <li
              key={editor.id}
              className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4"
            >
              <p className="text-sm">
                <span className="font-medium">{editor.user.email}</span> — series{" "}
                <span className="font-medium">{editor.series.title}</span>
              </p>
              <button
                onClick={() => removeSeriesEditor(editor.id)}
                className="text-sm text-red-600 hover:underline"
              >
                Revoke
              </button>
            </li>
          ))}
          {categoryEditors.length === 0 && seriesEditors.length === 0 && (
            <li className="p-4 text-sm text-zinc-500">No content editors assigned yet.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
