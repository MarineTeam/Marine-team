"use client";

import { useCallback, useEffect, useState } from "react";

type Prayer = {
  id: string;
  by: string;
  body: string;
  status: string;
  answeredNote: string | null;
  createdAt: string;
  prayers: number;
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Waiting",
  APPROVED: "On the wall",
  ANSWERED: "Answered",
  HIDDEN: "Taken down",
};

/**
 * The queue.
 *
 * Note what isn't here: a name for anything somebody asked to post
 * anonymously. It is in the database if it is ever genuinely needed, but this
 * screen gets left open on a church-office laptop, and a screenshot of it is
 * how an anonymous request stops being one.
 */
export function PrayerModeration() {
  const [requests, setRequests] = useState<Prayer[]>([]);
  const [note, setNote] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/prayer");
    if (response.ok) setRequests((await response.json()).requests);
    setLoaded(true);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function set(request: Prayer, patch: Record<string, unknown>) {
    const response = await fetch(`/api/admin/prayer/${request.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (response.ok) await load();
  }

  async function remove(request: Prayer) {
    if (!window.confirm("Delete this for good? Taking it down keeps the record; this doesn't.")) return;
    const response = await fetch(`/api/admin/prayer/${request.id}`, { method: "DELETE" });
    if (response.ok) await load();
  }

  const waiting = requests.filter((request) => request.status === "PENDING");
  const rest = requests.filter((request) => request.status !== "PENDING");

  return (
    <div className="space-y-6">
      <Section title={`Waiting (${waiting.length})`} empty="Nothing waiting.">
        {waiting.map((request) => (
          <Card key={request.id} request={request}>
            <button
              onClick={() => set(request, { status: "APPROVED" })}
              className="btn-primary rounded-md px-3 py-1.5 text-xs text-white"
            >
              Put it on the wall
            </button>
            <button
              onClick={() => set(request, { status: "HIDDEN" })}
              className="rounded-md border border-sep px-3 py-1.5 text-xs hover:bg-hover"
            >
              Keep it off
            </button>
          </Card>
        ))}
      </Section>

      <Section title="Everything else" empty={loaded ? "Nothing yet." : "Loading…"}>
        {rest.map((request) => (
          <Card key={request.id} request={request}>
            {request.status !== "ANSWERED" && (
              <span className="flex flex-wrap items-center gap-1.5">
                <input
                  value={note[request.id] ?? ""}
                  onChange={(e) => setNote({ ...note, [request.id]: e.target.value })}
                  placeholder="What happened?"
                  className="rounded-md border border-sep px-2 py-1 text-xs"
                />
                <button
                  onClick={() =>
                    set(request, { status: "ANSWERED", answeredNote: note[request.id] || null })
                  }
                  className="rounded-md border border-sep px-3 py-1.5 text-xs hover:bg-hover"
                >
                  Mark answered
                </button>
              </span>
            )}
            {request.status !== "HIDDEN" ? (
              <button
                onClick={() => set(request, { status: "HIDDEN" })}
                className="rounded-md border border-sep px-3 py-1.5 text-xs hover:bg-hover"
              >
                Take down
              </button>
            ) : (
              <button
                onClick={() => set(request, { status: "APPROVED" })}
                className="rounded-md border border-sep px-3 py-1.5 text-xs hover:bg-hover"
              >
                Put it back
              </button>
            )}
            <button
              onClick={() => remove(request)}
              className="rounded-md border border-sep px-3 py-1.5 text-xs hover:bg-hover"
            >
              Delete
            </button>
          </Card>
        ))}
      </Section>
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {children.length === 0 ? (
        <p className="rounded-lg border border-dashed border-sep p-6 text-center text-sm text-sec">
          {empty}
        </p>
      ) : (
        <ul className="space-y-2">{children}</ul>
      )}
    </section>
  );
}

function Card({ request, children }: { request: Prayer; children: React.ReactNode }) {
  return (
    <li id={request.id} className="space-y-2 rounded-lg border border-sep p-3">
      <p className="text-sm whitespace-pre-wrap text-ink">{request.body}</p>
      {request.answeredNote && (
        <p className="text-xs text-green-700 dark:text-green-400">Answered: {request.answeredNote}</p>
      )}
      <p className="text-xs text-sec">
        {request.by} · {new Date(request.createdAt).toLocaleString("en-GB")} ·{" "}
        {STATUS_LABELS[request.status] ?? request.status}
        {request.prayers > 0 && ` · ${request.prayers} praying`}
      </p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </li>
  );
}
