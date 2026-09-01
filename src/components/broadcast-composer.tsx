"use client";

import { useCallback, useEffect, useState } from "react";
import { smsSegments } from "@/lib/sms";

type Audience = "EVERYONE" | "PERMISSION_GROUP" | "EVENT" | "SMALL_GROUP" | "TEAM";
type Channel = "EMAIL" | "SMS" | "PUSH";

type Preview = {
  peopleReached: number;
  peopleMissed: number;
  perChannel: Record<string, number>;
  unreachable: { name: string | null; channel: string; reason: string }[];
  smsReady: boolean;
  smsReason: string | null;
};

type Sent = {
  id: string;
  subject: string;
  status: string;
  channels: string[];
  audience: Audience;
  audienceName: string | null;
  createdBy: string;
  createdAt: string;
  recipientCount: number;
};

const SKIP_LABELS: Record<string, string> = {
  "no-email": "no email address",
  "no-phone": "no mobile number",
  "no-sms-consent": "hasn't agreed to texts",
  unsubscribed: "turned off announcement emails",
  "no-push": "no device signed up",
};

const AUDIENCE_LABELS: Record<Audience, string> = {
  EVERYONE: "Everyone",
  PERMISSION_GROUP: "A permission group",
  EVENT: "Everyone signed up to an event",
  SMALL_GROUP: "A small group",
  TEAM: "A service team",
};

/**
 * Writing to everybody at once.
 *
 * The screen is arranged around the one number that matters — how many people
 * this will actually reach — and it is shown *before* the send button, with
 * the reasons the rest won't be reached spelled out. "I told everyone" being
 * false is how a family ends up outside a locked church.
 */
export function BroadcastComposer({
  options,
}: {
  options: {
    groups: { id: string; name: string }[];
    events: { id: string; title: string }[];
    smallGroups: { id: string; name: string }[];
    teams: { id: string; name: string }[];
  };
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [channels, setChannels] = useState<Channel[]>(["EMAIL"]);
  const [audience, setAudience] = useState<Audience>("EVERYONE");
  const [audienceId, setAudienceId] = useState<string>("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [history, setHistory] = useState<Sent[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choicesFor = (kind: Audience) =>
    kind === "PERMISSION_GROUP"
      ? options.groups.map((g) => ({ id: g.id, label: g.name }))
      : kind === "EVENT"
        ? options.events.map((e) => ({ id: e.id, label: e.title }))
        : kind === "SMALL_GROUP"
          ? options.smallGroups.map((g) => ({ id: g.id, label: g.name }))
          : kind === "TEAM"
            ? options.teams.map((t) => ({ id: t.id, label: t.name }))
            : [];

  const loadHistory = useCallback(async () => {
    const response = await fetch("/api/admin/broadcasts");
    if (response.ok) setHistory((await response.json()).broadcasts);
  }, []);

  const loadPreview = useCallback(async () => {
    const params = new URLSearchParams({
      preview: "1",
      audience,
      channels: channels.join(","),
      ...(audienceId ? { audienceId } : {}),
    });
    const response = await fetch(`/api/admin/broadcasts?${params}`);
    if (response.ok) setPreview(await response.json());
  }, [audience, audienceId, channels]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPreview();
  }, [loadPreview]);

  function toggleChannel(channel: Channel) {
    setChannels((current) =>
      current.includes(channel) ? current.filter((c) => c !== channel) : [...current, channel],
    );
  }

  async function create(): Promise<string | null> {
    const chosen = choicesFor(audience).find((choice) => choice.id === audienceId);
    const response = await fetch("/api/admin/broadcasts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject,
        body,
        channels,
        audience,
        audienceId: audienceId || null,
        audienceName: chosen?.label ?? null,
      }),
    });
    if (!response.ok) {
      setError((await response.json()).error ?? "Couldn't save that.");
      return null;
    }
    return (await response.json()).id as string;
  }

  async function testSend() {
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      const id = await create();
      if (!id) return;
      const response = await fetch(`/api/admin/broadcasts/${id}/test`, { method: "POST" });
      const outcome = await response.json();
      setProgress(
        [
          outcome.done.length > 0 ? `Sent a test ${outcome.done.join(" and ")}.` : "",
          ...outcome.problems,
        ]
          .filter(Boolean)
          .join(" "),
      );
      await loadHistory();
    } finally {
      setBusy(false);
    }
  }

  /**
   * Sends in a loop, one batch a call.
   *
   * The loop lives here rather than on the server because it is what turns a
   * long job into a progress bar — and because a request that tried to send
   * four hundred emails would be killed at the platform's timeout with no
   * record of how far it got.
   */
  async function send() {
    if (!preview) return;
    const total = preview.peopleReached;
    if (
      !window.confirm(
        `Send "${subject}" to ${total} ${total === 1 ? "person" : "people"}?\n\nThis can't be taken back.`,
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const id = await create();
      if (!id) return;

      for (;;) {
        const response = await fetch(`/api/admin/broadcasts/${id}/send`, { method: "POST" });
        if (!response.ok) {
          setError((await response.json()).error ?? "Sending stopped.");
          break;
        }
        const step = await response.json();
        setProgress(
          step.finished
            ? `Sent. ${step.sent} delivered${step.failed > 0 ? `, ${step.failed} failed` : ""}.`
            : `Sending… ${step.remaining} to go.`,
        );
        if (step.finished) break;
      }

      setSubject("");
      setBody("");
      await loadHistory();
    } finally {
      setBusy(false);
    }
  }

  const segments = smsSegments(`${subject}\n\n${body}`);
  const smsCount = preview?.perChannel.SMS ?? 0;
  const field = "mt-1 w-full rounded-md border border-sep px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-lg border border-sep p-4">
        <label className="block text-sm">
          <span className="text-sec">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className={field} />
        </label>
        <label className="block text-sm">
          <span className="text-sec">Message</span>
          <textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} className={field} />
        </label>

        <div className="flex flex-wrap gap-4 text-sm">
          {(["EMAIL", "SMS", "PUSH"] as Channel[]).map((channel) => (
            <label key={channel} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={channels.includes(channel)}
                onChange={() => toggleChannel(channel)}
              />
              {channel === "EMAIL" ? "Email" : channel === "SMS" ? "Text" : "Push notification"}
            </label>
          ))}
        </div>

        {channels.includes("SMS") && (
          <p className="text-xs text-sec">
            {preview?.smsReady === false ? (
              <span className="text-amber-700 dark:text-amber-400">{preview.smsReason}</span>
            ) : (
              <>
                {segments.segments} {segments.segments === 1 ? "text" : "texts"} each
                {segments.unicode && " (a character outside the plain set halves what fits in one)"}
                {smsCount > 0 && ` · ${segments.segments * smsCount} in total`}
              </>
            )}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-sec">Send to</span>
            <select
              value={audience}
              onChange={(e) => {
                setAudience(e.target.value as Audience);
                setAudienceId("");
              }}
              className={field}
            >
              {(Object.keys(AUDIENCE_LABELS) as Audience[]).map((kind) => (
                <option key={kind} value={kind}>
                  {AUDIENCE_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>

          {audience !== "EVERYONE" && (
            <label className="block text-sm">
              <span className="text-sec">Which one</span>
              <select value={audienceId} onChange={(e) => setAudienceId(e.target.value)} className={field}>
                <option value="">Choose…</option>
                {choicesFor(audience).map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </section>

      {preview && (
        <section className="space-y-2 rounded-lg border border-sep p-4">
          <p className="text-sm font-medium text-ink">
            This reaches {preview.peopleReached}{" "}
            {preview.peopleReached === 1 ? "person" : "people"}
            {preview.peopleMissed > 0 && (
              <span className="text-amber-700 dark:text-amber-400">
                {" "}
                — and {preview.peopleMissed}{" "}
                {preview.peopleMissed === 1 ? "person gets" : "people get"} nothing
              </span>
            )}
            .
          </p>
          <p className="text-xs text-sec">
            {Object.entries(preview.perChannel)
              .map(([channel, count]) => `${count} by ${channel.toLowerCase()}`)
              .join(", ") || "Nobody, on the channels chosen."}
          </p>
          {preview.unreachable.length > 0 && (
            <p className="text-xs text-ter">
              Not reached:{" "}
              {Object.entries(
                preview.unreachable.reduce<Record<string, number>>((counts, entry) => {
                  counts[entry.reason] = (counts[entry.reason] ?? 0) + 1;
                  return counts;
                }, {}),
              )
                .sort((a, b) => b[1] - a[1])
                .map(([reason, count]) => `${count} ${SKIP_LABELS[reason] ?? reason}`)
                .join(", ")}
            </p>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={testSend}
          disabled={busy || !subject || !body}
          className="rounded-md border border-sep px-4 py-2 text-sm hover:bg-hover disabled:opacity-60"
        >
          Send me a test first
        </button>
        <button
          onClick={send}
          disabled={busy || !subject || !body || (preview?.peopleReached ?? 0) === 0}
          className="btn-primary rounded-md px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {busy ? "Sending…" : `Send to ${preview?.peopleReached ?? 0}`}
        </button>
        {progress && <span className="text-sm text-sec">{progress}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink">Already sent</h2>
        {history.length === 0 ? (
          <p className="rounded-lg border border-dashed border-sep p-6 text-center text-sm text-sec">
            Nothing sent yet.
          </p>
        ) : (
          <ul className="divide-y divide-sep rounded-lg border border-sep">
            {history.map((item) => (
              <li key={item.id} className="px-4 py-3">
                <p className="text-sm text-ink">{item.subject}</p>
                <p className="text-xs text-sec">
                  {[
                    item.audienceName ?? AUDIENCE_LABELS[item.audience],
                    item.channels.map((c) => c.toLowerCase()).join(" + "),
                    `${item.recipientCount} sent`,
                    item.status.toLowerCase(),
                    new Date(item.createdAt).toLocaleString("en-GB"),
                    item.createdBy,
                  ].join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
