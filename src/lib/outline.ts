/**
 * A sermon's note outline: the sheet with gaps in it that a congregation
 * fills in while the talk is going on.
 *
 * The admin types the outline as plain text and marks each gap with three or
 * more underscores. Plain text rather than a builder UI because that is how
 * these are written everywhere else — in a document, the night before — and a
 * form with an "add blank" button would be slower for the same result.
 *
 * A blank is identified by its position in the outline, which is the whole
 * problem with editing one: insert a gap at the top and every answer below it
 * belongs to the wrong gap. Nothing here can prevent that, so
 * `fingerprintOutline` lets the storing side notice — see SermonOutlineAnswer
 * — and say so instead of quietly shuffling somebody's notes.
 */
import { fingerprintLines } from "./fingerprint";

/** Three or more underscores. Two is a typo; three is unambiguous on a page. */
const BLANK = /_{3,}/g;

export type OutlineSegment =
  | { kind: "text"; text: string }
  | { kind: "blank"; index: number };

export type ParsedOutline = {
  /** One entry per line of the outline, so the sheet keeps the shape it was typed in. */
  lines: OutlineSegment[][];
  /** How many gaps there are to fill. */
  blanks: number;
};

export function parseOutline(body: string): ParsedOutline {
  const lines: OutlineSegment[][] = [];
  let index = 0;

  for (const raw of body.replace(/\r\n?/g, "\n").split("\n")) {
    const segments: OutlineSegment[] = [];
    let at = 0;
    BLANK.lastIndex = 0;

    for (let match = BLANK.exec(raw); match; match = BLANK.exec(raw)) {
      if (match.index > at) segments.push({ kind: "text", text: raw.slice(at, match.index) });
      segments.push({ kind: "blank", index });
      index += 1;
      at = match.index + match[0].length;
    }
    if (at < raw.length) segments.push({ kind: "text", text: raw.slice(at) });

    lines.push(segments);
  }

  return { lines, blanks: index };
}

/**
 * A token for "this outline, as it reads right now".
 *
 * Stored with a member's answers so an outline edited after they filled it in
 * can be noticed rather than silently misread: their third answer is only
 * their third answer while the third gap is still the same gap.
 */
export function fingerprintOutline(body: string): string {
  return fingerprintLines(body.replace(/\r\n?/g, "\n").split("\n").map((line) => `${line}\n`));
}

/**
 * The filled-in sheet as plain text, for keeping or printing.
 *
 * An unanswered gap stays a gap rather than collapsing, so what comes out
 * reads like the sheet that went in — including which bits were missed.
 */
export function outlineToText(body: string, answers: Record<string, string>): string {
  return parseOutline(body)
    .lines.map((segments) =>
      segments
        .map((segment) =>
          segment.kind === "text" ? segment.text : (answers[String(segment.index)]?.trim() || "________"),
        )
        .join(""),
    )
    .join("\n");
}
