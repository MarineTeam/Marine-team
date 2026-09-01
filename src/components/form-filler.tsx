"use client";

import { useState } from "react";
import { isChoice, optionsOf, type Askable } from "@/lib/forms";
import type { Messages } from "@/lib/i18n";

/**
 * A form as somebody fills it in.
 *
 * The browser's own `required` and `type=email` are here because they give
 * quick, local feedback — but the server checks all of it again, and the
 * errors this shows come from there. What is on screen is a courtesy; what is
 * stored is decided by `validateSubmission`.
 */
export function FormFiller({
  slug,
  fields,
  confirmation,
  t,
}: {
  slug: string;
  fields: Askable[];
  confirmation: string | null;
  t: Messages["forms"];
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set(id: string, value: unknown) {
    setAnswers((current) => ({ ...current, [id]: value }));
    setErrors((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function toggle(id: string, option: string, on: boolean) {
    setAnswers((current) => {
      const chosen = Array.isArray(current[id]) ? (current[id] as string[]) : [];
      return { ...current, [id]: on ? [...chosen, option] : chosen.filter((value) => value !== option) };
    });
  }

  async function submit(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    setBusy(true);
    setMessage(null);
    setErrors({});
    try {
      const response = await fetch(`/api/forms/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (body.errors) setErrors(body.errors);
        throw new Error(body.error ?? "Couldn't send that.");
      }
      setSent(body.confirmation ?? confirmation ?? t.thankYou);
    } catch (thrown) {
      setMessage(thrown instanceof Error ? thrown.message : "Couldn't send that.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return <p className="rounded-lg border border-sep p-6 text-sm whitespace-pre-wrap text-ink">{sent}</p>;
  }

  if (fields.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-sep p-8 text-center text-sm text-sec">
        {t.noQuestions}
      </p>
    );
  }

  const field = "mt-1 w-full rounded-md border border-sep px-3 py-2 text-sm";

  return (
    <form onSubmit={submit} className="space-y-4">
      {fields.map((question) => {
        const options = isChoice(question.type) ? optionsOf(question) : [];
        const error = errors[question.id];
        return (
          <div key={question.id}>
            <label className="block text-sm" htmlFor={`field-${question.id}`}>
              <span className="font-medium text-ink">
                {question.label}
                {question.required && <span className="text-red-600"> *</span>}
              </span>
              {question.help && <span className="block text-xs text-sec">{question.help}</span>}

              {question.type === "TEXTAREA" && (
                <textarea
                  id={`field-${question.id}`}
                  rows={4}
                  required={question.required}
                  onChange={(e) => set(question.id, e.target.value)}
                  className={field}
                />
              )}

              {question.type === "SELECT" && (
                <select
                  id={`field-${question.id}`}
                  required={question.required}
                  defaultValue=""
                  onChange={(e) => set(question.id, e.target.value)}
                  className={field}
                >
                  <option value="" disabled>
                    {t.choose}
                  </option>
                  {options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              )}

              {question.type === "CHECKBOX" && (
                <input
                  id={`field-${question.id}`}
                  type="checkbox"
                  className="mt-2 mr-2"
                  onChange={(e) => set(question.id, e.target.checked)}
                />
              )}

              {["TEXT", "EMAIL", "PHONE", "NUMBER", "DATE"].includes(question.type) && (
                <input
                  id={`field-${question.id}`}
                  type={
                    question.type === "EMAIL"
                      ? "email"
                      : question.type === "NUMBER"
                        ? "number"
                        : question.type === "DATE"
                          ? "date"
                          : question.type === "PHONE"
                            ? "tel"
                            : "text"
                  }
                  required={question.required}
                  onChange={(e) => set(question.id, e.target.value)}
                  className={field}
                />
              )}
            </label>

            {question.type === "RADIO" && (
              <div className="mt-1 space-y-1">
                {options.map((option) => (
                  <label key={option} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={question.id}
                      value={option}
                      onChange={() => set(question.id, option)}
                    />
                    {option}
                  </label>
                ))}
              </div>
            )}

            {question.type === "CHECKBOXES" && (
              <div className="mt-1 space-y-1">
                {options.map((option) => (
                  <label key={option} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      value={option}
                      onChange={(e) => toggle(question.id, option, e.target.checked)}
                    />
                    {option}
                  </label>
                ))}
              </div>
            )}

            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          </div>
        );
      })}

      <button
        type="submit"
        disabled={busy}
        className="btn-primary rounded-md px-4 py-2 text-sm text-white disabled:opacity-60"
      >
        {busy ? "…" : t.send}
      </button>
      {message && <p className="text-sm text-red-600">{message}</p>}
    </form>
  );
}
