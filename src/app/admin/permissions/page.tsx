"use client";

import { useEffect, useState } from "react";
import { CAPABILITIES, type CapabilityKey } from "@/lib/capabilities";

type Category = { id: string; name: string };
type Series = { id: string; title: string };
type Group = {
  id: string;
  name: string;
  description: string | null;
  capabilities: string[];
  _count: { assignments: number };
};
type Assignment = {
  id: string;
  user: { id: string; email: string; name: string | null };
  group: { id: string; name: string };
  category: Category | null;
  series: Series | null;
};

function scopeLabel(a: Assignment): string {
  if (a.category) return `Category — ${a.category.name}`;
  if (a.series) return `Series — ${a.series.title}`;
  return "Site-wide";
}

export default function PermissionsAdminPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [seriesList, setSeriesList] = useState<Series[]>([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [capabilities, setCapabilities] = useState<Set<CapabilityKey>>(new Set());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editCapabilities, setEditCapabilities] = useState<Set<CapabilityKey>>(new Set());

  const [assignEmail, setAssignEmail] = useState("");
  const [assignGroupId, setAssignGroupId] = useState("");
  const [assignScope, setAssignScope] = useState<"site" | "category" | "series">("site");
  const [assignCategoryId, setAssignCategoryId] = useState("");
  const [assignSeriesId, setAssignSeriesId] = useState("");
  const [assignError, setAssignError] = useState<string | null>(null);

  async function load() {
    const [groupsRes, assignmentsRes, categoriesRes, seriesRes] = await Promise.all([
      fetch("/api/admin/permission-groups"),
      fetch("/api/admin/group-assignments"),
      fetch("/api/admin/categories"),
      fetch("/api/admin/series"),
    ]);
    if (groupsRes.ok) setGroups(await groupsRes.json());
    if (assignmentsRes.ok) setAssignments(await assignmentsRes.json());
    if (categoriesRes.ok) setCategories(await categoriesRes.json());
    if (seriesRes.ok) setSeriesList(await seriesRes.json());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  function toggleCapability(set: Set<CapabilityKey>, setSet: (s: Set<CapabilityKey>) => void, key: CapabilityKey) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSet(next);
  }

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/admin/permission-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, capabilities: Array.from(capabilities) }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create group");
      setName("");
      setDescription("");
      setCapabilities(new Set());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create group");
    } finally {
      setCreating(false);
    }
  }

  function openEdit(group: Group) {
    if (editingGroupId === group.id) {
      setEditingGroupId(null);
      return;
    }
    setEditingGroupId(group.id);
    setEditCapabilities(new Set(group.capabilities as CapabilityKey[]));
  }

  async function saveEdit(groupId: string) {
    await fetch(`/api/admin/permission-groups/${groupId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capabilities: Array.from(editCapabilities) }),
    });
    setEditingGroupId(null);
    await load();
  }

  async function removeGroup(id: string) {
    if (!confirm("Delete this group? Anyone assigned to it will lose the capabilities it grants."))
      return;
    await fetch(`/api/admin/permission-groups/${id}`, { method: "DELETE" });
    await load();
  }

  async function createAssignment(e: React.FormEvent) {
    e.preventDefault();
    setAssignError(null);
    try {
      const res = await fetch("/api/admin/group-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userEmail: assignEmail,
          groupId: assignGroupId,
          categoryId: assignScope === "category" ? assignCategoryId : null,
          seriesId: assignScope === "series" ? assignSeriesId : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to assign group");
      setAssignEmail("");
      setAssignGroupId("");
      setAssignScope("site");
      setAssignCategoryId("");
      setAssignSeriesId("");
      await load();
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : "Failed to assign group");
    }
  }

  async function removeAssignment(id: string) {
    await fetch(`/api/admin/group-assignments/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Permissions</h1>
        <p className="text-sm text-zinc-500">
          Define named permission groups (like phpBB/WordPress roles) with a custom set of
          capabilities, then assign a group to a user site-wide or scoped to one category or
          series. Admins always have every capability; this is for everyone else.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-medium">Groups</h2>
        <form
          onSubmit={createGroup}
          className="space-y-3 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Group name (e.g. Moderators)"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              required
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CAPABILITIES.map((cap) => (
              <label key={cap.key} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={capabilities.has(cap.key)}
                  onChange={() => toggleCapability(capabilities, setCapabilities, cap.key)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">{cap.label}</span>
                  <span className="block text-xs text-zinc-500">{cap.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          >
            Create group
          </button>
        </form>
        {error && <p className="text-sm text-red-600">{error}</p>}

        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
          {groups.map((group) => (
            <li key={group.id} className="p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                <div className="min-w-0">
                  <p className="font-medium">{group.name}</p>
                  <p className="text-sm text-zinc-500">
                    {group.description}
                    {group.description && " · "}
                    {group._count.assignments} assignment{group._count.assignments === 1 ? "" : "s"}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {group.capabilities.map((c) => (
                      <span
                        key={c}
                        className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                      >
                        {c.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <button
                    onClick={() => openEdit(group)}
                    className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700"
                  >
                    {editingGroupId === group.id ? "Close" : "Edit"}
                  </button>
                  <button onClick={() => removeGroup(group.id)} className="text-red-600 hover:underline">
                    Delete
                  </button>
                </div>
              </div>

              {editingGroupId === group.id && (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 space-y-3 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {CAPABILITIES.map((cap) => (
                      <label key={cap.key} className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={editCapabilities.has(cap.key)}
                          onChange={() => toggleCapability(editCapabilities, setEditCapabilities, cap.key)}
                          className="mt-0.5"
                        />
                        <span>{cap.label}</span>
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={() => saveEdit(group.id)}
                    className="rounded-md bg-zinc-900 text-white px-3 py-1.5 text-sm dark:bg-white dark:text-zinc-900"
                  >
                    Save
                  </button>
                </div>
              )}
            </li>
          ))}
          {groups.length === 0 && <li className="p-4 text-sm text-zinc-500">No groups yet.</li>}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Assignments</h2>
        <form
          onSubmit={createAssignment}
          className="space-y-2 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="email"
              value={assignEmail}
              onChange={(e) => setAssignEmail(e.target.value)}
              placeholder="person@example.com"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              required
            />
            <select
              value={assignGroupId}
              onChange={(e) => setAssignGroupId(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              required
            >
              <option value="">Choose a group…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={assignScope === "site"}
                onChange={() => setAssignScope("site")}
              />
              Site-wide
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={assignScope === "category"}
                onChange={() => setAssignScope("category")}
              />
              Category
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={assignScope === "series"}
                onChange={() => setAssignScope("series")}
              />
              Series
            </label>
          </div>
          {assignScope === "category" && (
            <select
              value={assignCategoryId}
              onChange={(e) => setAssignCategoryId(e.target.value)}
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
          )}
          {assignScope === "series" && (
            <select
              value={assignSeriesId}
              onChange={(e) => setAssignSeriesId(e.target.value)}
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
          )}
          <button
            type="submit"
            className="rounded-md bg-zinc-900 text-white px-4 py-2 text-sm hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
          >
            Assign
          </button>
        </form>
        {assignError && <p className="text-sm text-red-600">{assignError}</p>}

        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-800">
          {assignments.map((a) => (
            <li
              key={a.id}
              className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4"
            >
              <p className="text-sm">
                <span className="font-medium">{a.user.name ?? a.user.email}</span> —{" "}
                <span className="font-medium">{a.group.name}</span> · {scopeLabel(a)}
              </p>
              <button onClick={() => removeAssignment(a.id)} className="text-sm text-red-600 hover:underline">
                Revoke
              </button>
            </li>
          ))}
          {assignments.length === 0 && (
            <li className="p-4 text-sm text-zinc-500">No group assignments yet.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
