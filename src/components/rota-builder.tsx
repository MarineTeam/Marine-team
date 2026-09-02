"use client";

import { useCallback, useEffect, useState } from "react";

type Person = { id: string; name: string | null; displayName: string | null; email: string };
type Team = {
  id: string;
  name: string;
  members: { userId: string; position: string | null; user: Person }[];
};
type Assignment = {
  id: string;
  teamId: string;
  userId: string;
  position: string;
  status: "INVITED" | "ACCEPTED" | "DECLINED";
  note: string | null;
  personName: string;
  teamName: string;
  /** Whether this person said they're away on the day — see ServiceBlockout. */
  away: boolean;
  /** They've asked their team to take this one; nobody has yet. */
  coverWanted: boolean;
  coverNote: string | null;
  /** Set once somebody took it: who it was originally asked of. */
  coveredFor: string | null;
};

function label(person: Person): string {
  return person.displayName?.trim() || person.name?.trim() || person.email;
}

const STATUS_TEXT = {
  INVITED: "asked",
  ACCEPTED: "yes",
  DECLINED: "can't",
} as const;

/**
 * Who is on for this service.
 *
 * Asking somebody sends them a notification and shows up on their own rota
 * page, where they say yes or no — which is why the status sits next to every
 * name here. A list of names with no answers is what this replaces.
 */
export function RotaBuilder({ planId }: { planId: string }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState("");
  const [userId, setUserId] = useState("");
  const [position, setPosition] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Both halves on open: the teams to pick from, and who is already on.
   *
   * The second matters as much as the first — a panel that showed an empty
   * rota until you changed something would invite asking the same person
   * twice.
   */
  const load = useCallback(async () => {
    const [teamsRes, rotaRes] = await Promise.all([
      fetch("/api/admin/teams"),
      fetch(`/api/admin/services/${planId}/rota`),
    ]);
    if (teamsRes.ok) setTeams((await teamsRes.json()).teams);
    if (rotaRes.ok) setAssignments((await rotaRes.json()).assignments);
  }, [planId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const team = teams.find((candidate) => candidate.id === teamId) ?? null;
  const available = team
    ? team.members.filter(
        (member) => !assignments.some((row) => row.userId === member.userId && row.teamId === team.id),
      )
    : [];

  async function refresh() {
    const res = await fetch(`/api/admin/services/${planId}/rota`);
    if (res.ok) setAssignments((await res.json()).assignments);
  }

  async function assign() {
    if (!teamId || !userId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, teamId, userId, position }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't add them");
      setUserId("");
      setPosition("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add them");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/admin/assignments?id=${id}`, { method: "DELETE" });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-medium">Who&apos;s on</h4>

      {assignments.length > 0 && (
        <ul className="divide-y divide-sep rounded-md border border-sep text-xs">
          {assignments.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-2 p-2">
              <span className="min-w-0">
                <span className="block truncate">
                  {row.personName}
                  <span className="text-sec"> — {row.position || row.teamName}</span>
                </span>
                <span
                  className={
                    row.status === "ACCEPTED"
                      ? "text-green-600"
                      : row.status === "DECLINED"
                        ? "text-amber-600"
                        : "text-sec"
                  }
                >
                  {STATUS_TEXT[row.status]}
                  {row.note && ` — ${row.note}`}
                </span>
                {/* Two different facts, and an organiser needs both: somebody
                    is still needed for this one, or somebody already stepped
                    in and the name above is not who was first asked. */}
                {row.coverWanted && (
                  <span className="block text-amber-600">
                    needs cover{row.coverNote && ` — ${row.coverNote}`}
                  </span>
                )}
                {row.coveredFor && <span className="block text-sec">covering for {row.coveredFor}</span>}
              </span>
              <button
                onClick={() => void remove(row.id)}
                disabled={busy}
                className="shrink-0 text-sec hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label className="space-y-1">
          <span className="block text-sec">Team</span>
          <select
            value={teamId}
            onChange={(e) => {
              setTeamId(e.target.value);
              setUserId("");
            }}
            className="rounded-md border border-sep px-2 py-1.5"
          >
            <option value="">Choose…</option>
            {teams.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="block text-sec">Person</span>
          <select
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              // Their usual job, offered rather than imposed — most weeks it
              // is right, and the box stays editable for the weeks it isn't.
              const member = team?.members.find((row) => row.userId === e.target.value);
              setPosition(member?.position ?? "");
            }}
            disabled={!team}
            className="rounded-md border border-sep px-2 py-1.5 disabled:opacity-50"
          >
            <option value="">Choose…</option>
            {available.map((member) => (
              <option key={member.userId} value={member.userId}>
                {label(member.user)}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="block text-sec">Doing</span>
          <input
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            placeholder="Piano"
            className="rounded-md border border-sep px-2 py-1.5"
          />
        </label>

        <button
          onClick={() => void assign()}
          disabled={!teamId || !userId || busy}
          className="rounded-md border border-sep px-3 py-1.5 disabled:opacity-50"
        >
          Ask them
        </button>
      </div>

      {/* Said before the ask, not after: the point of knowing somebody is away
          is not to be told once you have already asked them. */}
      {assignments.some((row) => row.away) && (
        <p className="text-xs text-amber-600">
          {assignments
            .filter((row) => row.away)
            .map((row) => row.personName)
            .join(", ")}{" "}
          said they&apos;re away that day.
        </p>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
      {teams.length === 0 && (
        <p className="text-xs text-sec">
          No teams yet — make one under Teams before building a rota.
        </p>
      )}
    </div>
  );
}
