"use client";

import { useEffect, useState } from "react";

type GroupGrant = { id: string; group: { id: string; name: string } };
type UserGrant = { id: string; user: { id: string; email: string } };

/**
 * Manages granular viewing access for a series or video: which permission
 * groups ("roles") and which specific users can view it. As soon as any
 * grant exists here, the item stops being gated by the plain "Members only"
 * checkbox and is gated by these grants instead (see canViewSeries/
 * canViewVideo in src/lib/content.ts).
 */
export function ViewerAccessManager({ type, id }: { type: "series" | "video"; id: string }) {
  const base = `/api/admin/${type === "series" ? "series" : "videos"}/${id}`;

  const [groupGrants, setGroupGrants] = useState<GroupGrant[]>([]);
  const [availableGroups, setAvailableGroups] = useState<{ id: string; name: string }[]>([]);
  const [userGrants, setUserGrants] = useState<UserGrant[]>([]);
  const [email, setEmail] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [groupsRes, viewersRes] = await Promise.all([
      fetch(`${base}/viewer-groups`),
      fetch(`${base}/viewers`),
    ]);
    if (groupsRes.ok) {
      const data = await groupsRes.json();
      setGroupGrants(data.granted);
      setAvailableGroups(data.available);
    }
    if (viewersRes.ok) setUserGrants(await viewersRes.json());
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const revokeGroupPath = type === "series" ? "/api/admin/series/viewer-groups" : "/api/admin/videos/viewer-groups";
  const revokeUserPath = type === "series" ? "/api/admin/series/viewers" : "/api/admin/videos/viewers";

  async function toggleGroup(groupId: string) {
    const existing = groupGrants.find((g) => g.group.id === groupId);
    setError(null);
    if (existing) {
      await fetch(`${revokeGroupPath}/${existing.id}`, { method: "DELETE" });
    } else {
      const res = await fetch(`${base}/viewer-groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId }),
      });
      if (!res.ok) setError((await res.json()).error ?? "Failed to grant");
    }
    await load();
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    const res = await fetch(`${base}/viewers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userEmail: email.trim() }),
    });
    if (res.ok) {
      setEmail("");
      await load();
    } else {
      setError((await res.json()).error ?? "Failed to grant");
    }
  }

  async function removeUser(grantId: string) {
    await fetch(`${revokeUserPath}/${grantId}`, { method: "DELETE" });
    await load();
  }

  if (!loaded) return null;

  const restricted = groupGrants.length > 0 || userGrants.length > 0;

  return (
    <div className="space-y-3 rounded-lg border border-sep p-4">
      <div>
        <h3 className="font-medium">Restricted viewing</h3>
        <p className="text-sm text-sec">
          {restricted
            ? "Only the roles and people below can view this — the “Members only” setting is ignored while any grant exists."
            : "No role or per-user restrictions — falls back to the “Members only” setting above."}
        </p>
      </div>

      {availableGroups.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium uppercase text-sec">Roles</p>
          <div className="flex flex-wrap gap-3">
            {availableGroups.map((g) => (
              <label key={g.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={groupGrants.some((grant) => grant.group.id === g.id)}
                  onChange={() => toggleGroup(g.id)}
                />
                {g.name}
              </label>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-medium uppercase text-sec">Specific people</p>
        {userGrants.length > 0 && (
          <ul className="mb-2 space-y-1">
            {userGrants.map((grant) => (
              <li key={grant.id} className="flex items-center justify-between gap-2 text-sm">
                <span>{grant.user.email}</span>
                <button onClick={() => removeUser(grant.id)} className="text-red-600 hover:underline">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addUser} className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="person@example.com"
            className="min-w-0 flex-1 rounded-md border border-sep px-2 py-1 text-sm"
          />
          <button
            type="submit"
            className="rounded-md btn-primary px-2 py-1 text-sm text-white"
          >
            Grant
          </button>
        </form>
        <p className="mt-1 text-xs text-ter">They must have logged in at least once already.</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
