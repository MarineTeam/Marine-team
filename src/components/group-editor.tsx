"use client";

import { useCallback, useEffect, useState } from "react";

export type EditableGroup = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  meetsWhen: string | null;
  area: string | null;
  address: string | null;
  published: boolean;
  openToJoin: boolean;
  capacity: number | null;
};

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  note: string | null;
};

export function GroupEditor({ group: initial }: { group: EditableGroup }) {
  const [group, setGroup] = useState(initial);
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("MEMBER");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/groups/${initial.id}`);
    if (response.ok) setMembers((await response.json()).members);
  }, [initial.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function save(patch: Partial<EditableGroup>) {
    setError(null);
    const response = await fetch(`/api/admin/groups/${group.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (response.ok) setSaved("Saved.");
    else setError((await response.json()).error ?? "Couldn't save that.");
  }

  async function addMember(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setError(null);
    const response = await fetch(`/api/admin/groups/${group.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    if (response.ok) {
      setEmail("");
      await load();
    } else {
      setError((await response.json()).error ?? "Couldn't add them.");
    }
  }

  async function removeMember(member: Member) {
    if (!window.confirm(`Take ${member.name} out of this group?`)) return;
    const response = await fetch(`/api/admin/groups/${group.id}/members/${member.id}`, {
      method: "DELETE",
    });
    if (response.ok) await load();
  }

  const field = "mt-1 w-full rounded-md border border-sep px-3 py-2 text-sm";
  const leaders = members.filter((member) => member.role === "LEADER" && member.status === "ACTIVE");

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-lg border border-sep p-4">
        <label className="block text-sm">
          <span className="text-sec">Name</span>
          <input
            value={group.name}
            onChange={(e) => setGroup({ ...group, name: e.target.value })}
            onBlur={() => save({ name: group.name })}
            className={field}
          />
        </label>
        <label className="block text-sm">
          <span className="text-sec">Web address</span>
          <input
            value={group.slug}
            onChange={(e) => setGroup({ ...group, slug: e.target.value })}
            onBlur={() => save({ slug: group.slug })}
            className={field}
          />
          <span className="mt-1 block text-xs text-ter">/groups/{group.slug}</span>
        </label>
        <label className="block text-sm">
          <span className="text-sec">About it</span>
          <textarea
            rows={3}
            value={group.description ?? ""}
            onChange={(e) => setGroup({ ...group, description: e.target.value })}
            onBlur={() => save({ description: group.description })}
            className={field}
          />
        </label>
        <label className="block text-sm">
          <span className="text-sec">When it meets</span>
          <input
            value={group.meetsWhen ?? ""}
            onChange={(e) => setGroup({ ...group, meetsWhen: e.target.value })}
            onBlur={() => save({ meetsWhen: group.meetsWhen })}
            placeholder="Tuesdays, 7.30pm"
            className={field}
          />
        </label>
      </section>

      <section className="space-y-3 rounded-lg border border-sep p-4">
        <p className="text-sm font-medium text-ink">Where it meets</p>
        <label className="block text-sm">
          <span className="text-sec">Roughly — shown to everybody</span>
          <input
            value={group.area ?? ""}
            onChange={(e) => setGroup({ ...group, area: e.target.value })}
            onBlur={() => save({ area: group.area })}
            placeholder="North side, near the station"
            className={field}
          />
        </label>
        <label className="block text-sm">
          <span className="text-sec">Exactly — shown only to people in the group</span>
          <textarea
            rows={2}
            value={group.address ?? ""}
            onChange={(e) => setGroup({ ...group, address: e.target.value })}
            onBlur={() => save({ address: group.address })}
            placeholder="14 Rowan Close"
            className={field}
          />
          <span className="mt-1 block text-xs text-ter">
            Nobody sees this until a leader has said yes to them — not even somebody who has asked to
            join. Most groups meet in somebody&apos;s home, and an address that has been public once
            stays somewhere for good.
          </span>
        </label>
      </section>

      <section className="space-y-3 rounded-lg border border-sep p-4">
        <div className="flex flex-wrap gap-4 text-sm">
          <Toggle
            label="Published"
            checked={group.published}
            onChange={(v) => {
              setGroup({ ...group, published: v });
              save({ published: v });
            }}
          />
          <Toggle
            label="Taking new people"
            checked={group.openToJoin}
            onChange={(v) => {
              setGroup({ ...group, openToJoin: v });
              save({ openToJoin: v });
            }}
          />
        </div>
        <label className="block text-sm">
          <span className="text-sec">How many it holds (blank for no limit)</span>
          <input
            type="number"
            min={0}
            value={group.capacity ?? ""}
            onChange={(e) =>
              setGroup({ ...group, capacity: e.target.value === "" ? null : Number(e.target.value) })
            }
            onBlur={() => save({ capacity: group.capacity })}
            className="mt-1 w-32 rounded-md border border-sep px-3 py-2 text-sm"
          />
        </label>
        {saved && <p className="text-xs text-green-700 dark:text-green-400">{saved}</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Who&apos;s in it</h2>
        {leaders.length === 0 && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            This group has no leader, so nobody can answer a request to join it.
          </p>
        )}

        <form onSubmit={addMember} className="flex flex-wrap items-end gap-2 rounded-lg border border-sep p-3">
          <label className="text-sm">
            <span className="block text-sec">Add somebody by email</span>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 rounded-md border border-sep px-3 py-1.5"
            />
          </label>
          <label className="text-sm">
            <span className="block text-sec">As</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 rounded-md border border-sep px-3 py-1.5"
            >
              <option value="MEMBER">Member</option>
              <option value="LEADER">Leader</option>
            </select>
          </label>
          <button type="submit" className="rounded-md border border-sep px-3 py-1.5 text-sm hover:bg-hover">
            Add
          </button>
        </form>

        {members.length === 0 ? (
          <p className="rounded-lg border border-dashed border-sep p-6 text-center text-sm text-sec">
            Nobody yet.
          </p>
        ) : (
          <ul className="divide-y divide-sep rounded-lg border border-sep">
            {members.map((member) => (
              <li key={member.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-ink">
                    {member.name}
                    {member.role === "LEADER" && <span className="ml-2 text-xs text-accent">leader</span>}
                    {member.status !== "ACTIVE" && (
                      <span className="ml-2 text-xs text-ter">
                        {member.status === "REQUESTED" ? "asked to join" : "not in the group"}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-sec">{member.email}</p>
                  {member.note && <p className="mt-0.5 text-xs text-ter">{member.note}</p>}
                </div>
                <button
                  onClick={() => removeMember(member)}
                  className="shrink-0 rounded-md border border-sep px-2 py-1 text-xs hover:bg-hover"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
