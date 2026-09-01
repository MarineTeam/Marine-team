"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { joinMessage, type JoinState, type Standing } from "@/lib/groups";
import { format, type Messages } from "@/lib/i18n";

type Request = { id: string; name: string; note: string | null; askedAt: string };

/**
 * Asking to join, leaving, and — if you lead it — answering the people who
 * have asked.
 *
 * A leader is not staff and gets no admin page: the person who hosts the
 * Tuesday group shouldn't need a capability grant to answer somebody knocking
 * on their own door.
 */
export function GroupPanel({
  slug,
  standing,
  state,
  t,
}: {
  slug: string;
  standing: Standing;
  state: JoinState;
  t: Messages["groups"];
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);

  const leads = standing === "leader";

  const loadRequests = useCallback(async () => {
    if (!leads) return;
    const response = await fetch(`/api/groups/${slug}/requests`);
    if (response.ok) setRequests((await response.json()).requests);
  }, [leads, slug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRequests();
  }, [loadRequests]);

  async function ask(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/groups/${slug}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note || null }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Couldn't send that.");
      router.refresh();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "Couldn't send that.");
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    if (!window.confirm(standing === "requested" ? t.withdraw : t.leaveGroup)) {
      return;
    }
    const response = await fetch(`/api/groups/${slug}/join`, { method: "DELETE" });
    if (response.ok) router.refresh();
  }

  async function answer(request: Request, accept: boolean) {
    const response = await fetch(`/api/groups/${slug}/requests/${request.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accept }),
    });
    if (response.ok) {
      await loadRequests();
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      {state === "open" ? (
        <form onSubmit={ask} className="space-y-2 rounded-lg border border-sep p-4">
          <label className="block text-sm">
            <span className="text-sec">{t.anythingToSay}</span>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-md border border-sep px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="btn-primary rounded-md px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {busy ? "…" : t.askToJoin}
          </button>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-sep p-4">
          <p className="text-sm text-sec">{joinMessage(state)}</p>
          {(standing === "member" || standing === "requested") && (
            <button
              onClick={leave}
              className="rounded-md border border-sep px-3 py-1.5 text-sm hover:bg-hover"
            >
              {standing === "requested" ? t.withdraw : t.leaveGroup}
            </button>
          )}
        </div>
      )}

      {leads && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-ink">
            {requests.length === 0
              ? t.nobodyWaiting
              : requests.length === 1
                ? t.onePersonAsked
                : format(t.peopleAsked, { count: requests.length })}
          </h2>
          {requests.map((request) => (
            <div key={request.id} className="space-y-2 rounded-lg border border-sep p-3">
              <p className="text-sm text-ink">{request.name}</p>
              {request.note && <p className="text-xs whitespace-pre-wrap text-sec">{request.note}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => answer(request, true)}
                  className="btn-primary rounded-md px-3 py-1.5 text-xs text-white"
                >
                  {t.yesComeAlong}
                </button>
                <button
                  onClick={() => answer(request, false)}
                  className="rounded-md border border-sep px-3 py-1.5 text-xs hover:bg-hover"
                >
                  {t.notThisOne}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
