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
  const [editorError, setEditorError] = useState<string | null>(null);
  const [managingUserId, setManagingUserId] = useState<string | null>(null);
  const [newCategoryId, setNewCategoryId] = useState("");
  const [newSeriesId, setNewSeriesId] = useState("");

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

  function openManage(userId: string) {
    setManagingUserId((current) => (current === userId ? null : userId));
    setNewCategoryId("");
    setNewSeriesId("");
    setEditorError(null);
  }

  async function addCategoryEditor(userEmail: string) {
    if (!newCategoryId) return;
    setEditorError(null);
    try {
      const res = await fetch("/api/admin/editors/category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userEmail, categoryId: newCategoryId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to add editor");
      setNewCategoryId("");
      await loadEditors();
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : "Failed to add editor");
    }
  }

  async function addSeriesEditor(userEmail: string) {
    if (!newSeriesId) return;
    setEditorError(null);
    try {
      const res = await fetch("/api/admin/editors/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userEmail, seriesId: newSeriesId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to add editor");
      setNewSeriesId("");
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
          Accounts and roles. Anyone who attempts to log in shows up below as pending — you decide
          whether to grant them access.
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          Granting or revoking here writes to the same list as{" "}
          <a href="/admin/authorized-emails" className="underline">
            Authorized emails
          </a>
          , which is what actually decides who may sign in. Use that page to add someone who
          hasn&apos;t logged in yet, or to see who granted an address and when.
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
        <div>
          <h2 className="font-medium">Authorized users &amp; permissions</h2>
          <p className="text-sm text-zinc-500">
            Set a user&apos;s site role here, or click <span className="font-medium">Manage permissions</span> to
            grant or revoke that specific user&apos;s content-editor access — one category (and
            everything under it) or one specific series — all in one place.
          </p>
        </div>
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
          {authorized.map((u) => {
            const userCategoryEditors = categoryEditors.filter((ce) => ce.user.id === u.id);
            const userSeriesEditors = seriesEditors.filter((se) => se.user.id === u.id);
            const grantCount = userCategoryEditors.length + userSeriesEditors.length;
            const isManaging = managingUserId === u.id;
            return (
              <li key={u.id} className="p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                  <div className="min-w-0">
                    <p className="font-medium">{u.name ?? u.email}</p>
                    <p className="text-sm text-zinc-500">
                      {u.email} · {u.auth0Id ? "has logged in" : "invited, not yet logged in"}
                      {grantCount > 0 &&
                        ` · ${grantCount} content-editor grant${grantCount === 1 ? "" : "s"}`}
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
                    {u.role !== "ADMIN" && (
                      <button
                        onClick={() => openManage(u.id)}
                        className={`rounded-md border px-2 py-1 dark:border-zinc-700 ${isManaging ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : ""}`}
                      >
                        {isManaging ? "Close" : "Manage permissions"}
                      </button>
                    )}
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
                </div>

                {isManaging && (
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 space-y-3 dark:border-zinc-800 dark:bg-zinc-900">
                    <ul className="space-y-1.5 text-sm">
                      {userCategoryEditors.map((ce) => (
                        <li key={ce.id} className="flex items-center justify-between gap-2">
                          <span>
                            Category — <span className="font-medium">{ce.category.name}</span>
                          </span>
                          <button
                            onClick={() => removeCategoryEditor(ce.id)}
                            className="text-red-600 hover:underline"
                          >
                            Revoke
                          </button>
                        </li>
                      ))}
                      {userSeriesEditors.map((se) => (
                        <li key={se.id} className="flex items-center justify-between gap-2">
                          <span>
                            Series — <span className="font-medium">{se.series.title}</span>
                          </span>
                          <button
                            onClick={() => removeSeriesEditor(se.id)}
                            className="text-red-600 hover:underline"
                          >
                            Revoke
                          </button>
                        </li>
                      ))}
                      {grantCount === 0 && (
                        <li className="text-zinc-500">No content-editor grants yet.</li>
                      )}
                    </ul>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="flex items-center gap-2">
                        <select
                          value={newCategoryId}
                          onChange={(e) => setNewCategoryId(e.target.value)}
                          className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                        >
                          <option value="">Grant a category…</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => addCategoryEditor(u.email)}
                          disabled={!newCategoryId}
                          className="rounded-md bg-zinc-900 text-white px-2 py-1 text-sm disabled:opacity-50 dark:bg-white dark:text-zinc-900"
                        >
                          Add
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={newSeriesId}
                          onChange={(e) => setNewSeriesId(e.target.value)}
                          className="flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                        >
                          <option value="">Grant a series…</option>
                          {seriesList.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.title}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => addSeriesEditor(u.email)}
                          disabled={!newSeriesId}
                          className="rounded-md bg-zinc-900 text-white px-2 py-1 text-sm disabled:opacity-50 dark:bg-white dark:text-zinc-900"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                    {editorError && <p className="text-sm text-red-600">{editorError}</p>}
                  </div>
                )}
              </li>
            );
          })}
          {authorized.length === 0 && (
            <li className="p-4 text-sm text-zinc-500">No authorized users yet.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
