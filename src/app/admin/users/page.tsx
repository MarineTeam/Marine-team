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

export default function UsersAdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/users");
    if (res.ok) setUsers(await res.json());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

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
            <li key={u.id} className="p-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{u.name ?? u.email}</p>
                <p className="text-sm text-zinc-500">{u.email} · tried to log in</p>
              </div>
              <div className="flex items-center gap-2 text-sm">
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
            <li key={u.id} className="p-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{u.name ?? u.email}</p>
                <p className="text-sm text-zinc-500">
                  {u.email} · {u.auth0Id ? "has logged in" : "invited, not yet logged in"}
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm">
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
    </div>
  );
}
