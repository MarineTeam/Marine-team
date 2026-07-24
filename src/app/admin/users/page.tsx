"use client";

import { useEffect, useState } from "react";

type User = {
  id: string;
  email: string;
  name: string | null;
  role: "MEMBER" | "ADMIN";
  auth0Id: string | null;
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

  async function changeRole(u: User, role: "MEMBER" | "ADMIN") {
    await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Revoke this person's access? They won't be able to log in anymore.")) return;
    setError(null);
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json()).error ?? "Failed to remove");
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Access</h1>
        <p className="text-sm text-zinc-500">
          Only emails listed here (or in the <code>ADMIN_EMAILS</code> env var) can log in.
          Everyone else is rejected even if they have a valid Google/Auth0 account.
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
          Authorize
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
        {users.map((u) => (
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
                onChange={(e) => changeRole(u, e.target.value as "MEMBER" | "ADMIN")}
                className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Admin</option>
              </select>
              <button onClick={() => remove(u.id)} className="text-red-600 hover:underline">
                Revoke
              </button>
            </div>
          </li>
        ))}
        {users.length === 0 && (
          <li className="p-4 text-sm text-zinc-500">No authorized users yet.</li>
        )}
      </ul>
    </div>
  );
}
