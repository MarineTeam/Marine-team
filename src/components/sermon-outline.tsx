"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { outlineToText, parseOutline } from "@/lib/outline";
import { PrintButton } from "@/components/print-button";

/** How long after the last keystroke the sheet is saved. Long enough not to save every letter, short enough that closing the tab loses a word, not a point. */
const SAVE_AFTER_MS = 800;

/**
 * The fill-in-the-blank sheet for a talk.
 *
 * The paper version of this is handed out at the door every Sunday in a great
 * many churches; the app's version is the same sheet, filled in on a phone
 * while the talk is going on, and still there afterwards.
 *
 * Saved as it is typed rather than on a button. Somebody filling this in is
 * listening to something else at the time, and a Save they forget is the
 * whole sheet lost.
 */
export function SermonOutline({
  videoId,
  videoTitle,
  outline,
  initialAnswers,
  outlineChanged,
  canSave,
}: {
  videoId: string;
  videoTitle: string;
  outline: string;
  initialAnswers: Record<string, string>;
  /**
   * Whether the outline has been edited since these answers were written —
   * in which case a gap's number may no longer mean the same gap.
   */
  outlineChanged: boolean;
  /** Signed-out visitors get the sheet to read and print, but nothing to save to. */
  canSave: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parsed = useMemo(() => parseOutline(outline), [outline]);
  const filled = Object.values(answers).filter((value) => value.trim()).length;

  const save = useCallback(
    async (next: Record<string, string>) => {
      if (!canSave) return;
      setStatus("saving");
      try {
        const res = await fetch("/api/videos/outline", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId, answers: next }),
        });
        setStatus(res.ok ? "saved" : "error");
      } catch {
        // Offline mid-talk is the normal case, not an exception. What was
        // typed stays on screen and the next keystroke tries again.
        setStatus("error");
      }
    },
    [canSave, videoId],
  );

  function change(index: number, value: string) {
    const next = { ...answers, [String(index)]: value };
    setAnswers(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(next), SAVE_AFTER_MS);
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copyOut() {
    try {
      await navigator.clipboard.writeText(`${videoTitle}\n\n${outlineToText(outline, answers)}`);
    } catch {
      // No clipboard in this context; the sheet is on screen either way.
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-sep p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-bold tracking-[0.08em] text-ter uppercase">Notes</h2>
        <span className="no-print text-xs text-sec">
          {filled} of {parsed.blanks} filled in
          {canSave && status === "saving" && " · saving…"}
          {canSave && status === "saved" && " · saved"}
          {canSave && status === "error" && " · not saved — still on this screen"}
        </span>
      </div>

      {outlineChanged && (
        <p className="no-print rounded-md border border-amber-300 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:text-amber-300">
          This sheet has been edited since you filled it in, so an answer may
          no longer sit against the gap it was written for. Worth a read before
          you rely on it.
        </p>
      )}

      <div className="space-y-1 text-[15px] leading-relaxed">
        {parsed.lines.map((segments, line) => (
          <p key={line} className="min-h-[1.4em]">
            {segments.map((segment, at) =>
              segment.kind === "text" ? (
                <span key={at}>{segment.text}</span>
              ) : (
                <input
                  key={at}
                  value={answers[String(segment.index)] ?? ""}
                  onChange={(e) => change(segment.index, e.target.value)}
                  aria-label={`Blank ${segment.index + 1}`}
                  className="mx-1 w-40 border-0 border-b border-sep bg-transparent px-1 py-0.5 text-[15px] focus:border-accent focus:outline-none"
                />
              ),
            )}
          </p>
        ))}
      </div>

      <div className="no-print flex flex-wrap items-center gap-2">
        <PrintButton label="Print" />
        <button
          type="button"
          onClick={() => void copyOut()}
          className="rounded-md border border-sep px-3 py-1.5 text-sm hover:bg-hover"
        >
          Copy as text
        </button>
        {!canSave && <span className="text-xs text-sec">Log in to keep what you write here.</span>}
      </div>
    </section>
  );
}
