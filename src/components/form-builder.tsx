"use client";

import { useCallback, useEffect, useState } from "react";
import { isChoice } from "@/lib/forms";

type FieldType =
  | "TEXT"
  | "TEXTAREA"
  | "EMAIL"
  | "PHONE"
  | "NUMBER"
  | "DATE"
  | "SELECT"
  | "RADIO"
  | "CHECKBOX"
  | "CHECKBOXES";

type Field = {
  id: string;
  label: string;
  type: FieldType;
  help: string | null;
  required: boolean;
  options: string | null;
  position: number;
  deletedAt: string | null;
};

type FormShape = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  confirmation: string | null;
  notifyEmails: string | null;
  published: boolean;
  memberOnly: boolean;
  multiple: boolean;
  fields: Field[];
};

type Submission = {
  id: string;
  createdAt: string;
  handledAt: string | null;
  handledBy: string | null;
  user: { email: string } | null;
  answers: { fieldId: string; value: string }[];
};

const TYPE_LABELS: Record<FieldType, string> = {
  TEXT: "Short answer",
  TEXTAREA: "Long answer",
  EMAIL: "Email",
  PHONE: "Phone",
  NUMBER: "Number",
  DATE: "Date",
  SELECT: "Drop-down",
  RADIO: "Choose one",
  CHECKBOX: "Single tick box",
  CHECKBOXES: "Choose any",
};

/**
 * Building a form, and reading what came back.
 *
 * The two are on one screen because the reason to edit a form is almost always
 * something you noticed in the answers.
 */
export function FormBuilder({ form: initial }: { form: FormShape }) {
  const [form, setForm] = useState(initial);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [columns, setColumns] = useState<{ id: string; label: string; retired: boolean }[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<FieldType>("TEXT");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [formResponse, submissionsResponse] = await Promise.all([
      fetch(`/api/admin/forms/${initial.id}`),
      fetch(`/api/admin/forms/${initial.id}/submissions`),
    ]);
    if (formResponse.ok) setForm((await formResponse.json()).form);
    if (submissionsResponse.ok) {
      const body = await submissionsResponse.json();
      setColumns(body.columns);
      setSubmissions(body.submissions);
    }
  }, [initial.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  async function saveForm(patch: Partial<FormShape>) {
    setError(null);
    const response = await fetch(`/api/admin/forms/${form.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (response.ok) {
      setForm((current) => ({ ...current, ...patch }));
      setSaved("Saved.");
    } else {
      setError((await response.json()).error ?? "Couldn't save that.");
    }
  }

  async function addField(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    const response = await fetch(`/api/admin/forms/${form.id}/fields`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newLabel, type: newType }),
    });
    if (response.ok) {
      setNewLabel("");
      await reload();
    }
  }

  async function saveField(field: Field, patch: Partial<Field>) {
    setForm((current) => ({
      ...current,
      fields: current.fields.map((f) => (f.id === field.id ? { ...f, ...patch } : f)),
    }));
    await fetch(`/api/admin/forms/${form.id}/fields/${field.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async function retireField(field: Field) {
    if (
      !window.confirm(
        `Stop asking "${field.label}"? Answers already given stay in the responses — they just stop being asked for.`,
      )
    ) {
      return;
    }
    await fetch(`/api/admin/forms/${form.id}/fields/${field.id}`, { method: "DELETE" });
    await reload();
  }

  async function setHandled(submission: Submission, handled: boolean) {
    await fetch(`/api/admin/forms/${form.id}/submissions/${submission.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handled }),
    });
    await reload();
  }

  const live = form.fields.filter((field) => field.deletedAt === null);
  const input = "mt-1 w-full rounded-md border border-sep px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-lg border border-sep p-4">
        <label className="block text-sm">
          <span className="text-sec">Name</span>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            onBlur={() => saveForm({ title: form.title })}
            className={input}
          />
        </label>
        <label className="block text-sm">
          <span className="text-sec">Web address</span>
          <input
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            onBlur={() => saveForm({ slug: form.slug })}
            className={input}
          />
          <span className="mt-1 block text-xs text-ter">/forms/{form.slug}</span>
        </label>
        <label className="block text-sm">
          <span className="text-sec">Introduction</span>
          <textarea
            rows={3}
            value={form.description ?? ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            onBlur={() => saveForm({ description: form.description })}
            className={input}
          />
        </label>
        <label className="block text-sm">
          <span className="text-sec">What to say afterwards</span>
          <textarea
            rows={2}
            value={form.confirmation ?? ""}
            onChange={(e) => setForm({ ...form, confirmation: e.target.value })}
            onBlur={() => saveForm({ confirmation: form.confirmation })}
            placeholder="Thank you — somebody will be in touch."
            className={input}
          />
        </label>
        <label className="block text-sm">
          <span className="text-sec">Email these people when one comes in</span>
          <input
            value={form.notifyEmails ?? ""}
            onChange={(e) => setForm({ ...form, notifyEmails: e.target.value })}
            onBlur={() => saveForm({ notifyEmails: form.notifyEmails })}
            placeholder="pastor@example.org, office@example.org"
            className={input}
          />
        </label>
        <div className="flex flex-wrap gap-4 text-sm">
          <Toggle
            label="Published"
            checked={form.published}
            onChange={(v) => saveForm({ published: v })}
          />
          <Toggle
            label="Members only"
            checked={form.memberOnly}
            onChange={(v) => saveForm({ memberOnly: v })}
          />
          <Toggle
            label="Can be sent more than once"
            checked={form.multiple}
            onChange={(v) => saveForm({ multiple: v })}
          />
        </div>
        {saved && <p className="text-xs text-green-700 dark:text-green-400">{saved}</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Questions</h2>

        {live.length === 0 && (
          <p className="rounded-lg border border-dashed border-sep p-6 text-center text-sm text-sec">
            No questions yet.
          </p>
        )}

        {live.map((field) => (
          <div key={field.id} className="space-y-2 rounded-lg border border-sep p-3">
            <div className="flex items-start gap-2">
              <input
                value={field.label}
                onChange={(e) =>
                  setForm({
                    ...form,
                    fields: form.fields.map((f) =>
                      f.id === field.id ? { ...f, label: e.target.value } : f,
                    ),
                  })
                }
                onBlur={() => saveField(field, { label: field.label })}
                className="flex-1 rounded-md border border-sep px-3 py-1.5 text-sm"
              />
              <span className="shrink-0 rounded-md border border-sep px-2 py-1.5 text-xs text-sec">
                {TYPE_LABELS[field.type]}
              </span>
              <button
                onClick={() => retireField(field)}
                className="shrink-0 rounded-md border border-sep px-2 py-1.5 text-xs hover:bg-hover"
              >
                Stop asking
              </button>
            </div>

            <input
              value={field.help ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  fields: form.fields.map((f) => (f.id === field.id ? { ...f, help: e.target.value } : f)),
                })
              }
              onBlur={() => saveField(field, { help: field.help })}
              placeholder="A line of help under the question (optional)"
              className="w-full rounded-md border border-sep px-3 py-1.5 text-xs"
            />

            {isChoice(field.type) && (
              <textarea
                rows={3}
                value={field.options ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    fields: form.fields.map((f) =>
                      f.id === field.id ? { ...f, options: e.target.value } : f,
                    ),
                  })
                }
                onBlur={() => saveField(field, { options: field.options })}
                placeholder={"One option per line\nYes\nNo\nMaybe"}
                className="w-full rounded-md border border-sep px-3 py-1.5 font-mono text-xs"
              />
            )}

            <Toggle
              label="Needed"
              checked={field.required}
              onChange={(v) => saveField(field, { required: v })}
            />
          </div>
        ))}

        <form onSubmit={addField} className="flex flex-wrap items-end gap-2 rounded-lg border border-sep p-3">
          <label className="text-sm">
            <span className="block text-sec">Question</span>
            <input
              required
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Your name"
              className="mt-1 rounded-md border border-sep px-3 py-1.5"
            />
          </label>
          <label className="text-sm">
            <span className="block text-sec">Kind</span>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as FieldType)}
              className="mt-1 rounded-md border border-sep px-3 py-1.5"
            >
              {(Object.keys(TYPE_LABELS) as FieldType[]).map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-md border border-sep px-3 py-1.5 text-sm hover:bg-hover">
            Add question
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">
            {submissions.length} {submissions.length === 1 ? "response" : "responses"}
          </h2>
          {submissions.length > 0 && (
            <a
              href={`/api/admin/forms/${form.id}/submissions?format=csv`}
              className="text-sm text-accent hover:underline"
            >
              Download as CSV
            </a>
          )}
        </div>

        {submissions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-sep p-6 text-center text-sm text-sec">
            Nothing yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {submissions.map((submission) => (
              <li key={submission.id} className="space-y-2 rounded-lg border border-sep p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-sec">
                    {new Date(submission.createdAt).toLocaleString("en-GB")}
                    {submission.user ? ` · ${submission.user.email}` : " · no account"}
                  </p>
                  <label className="flex items-center gap-1.5 text-xs text-sec">
                    <input
                      type="checkbox"
                      checked={submission.handledAt !== null}
                      onChange={(e) => setHandled(submission, e.target.checked)}
                    />
                    {submission.handledAt ? `Dealt with by ${submission.handledBy}` : "Dealt with"}
                  </label>
                </div>
                <dl className="space-y-1 text-sm">
                  {columns.map((column) => {
                    const answer = submission.answers.find((a) => a.fieldId === column.id);
                    if (!answer) return null;
                    return (
                      <div key={column.id} className="flex gap-2">
                        <dt className="shrink-0 text-sec">
                          {column.label}
                          {/* A question that is no longer asked still labels
                              the answer somebody gave to it. */}
                          {column.retired && <span className="text-ter"> (retired)</span>}:
                        </dt>
                        <dd className="min-w-0 text-ink">{answer.value.split("\n").join(", ")}</dd>
                      </div>
                    );
                  })}
                </dl>
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
