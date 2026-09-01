import type { FormField, FormFieldType } from "@prisma/client";

/**
 * Forms somebody builds rather than somebody deploys.
 *
 * The connect card in the pew changes every term — a box for dietary
 * requirements, a question about the new course — and a deploy is the wrong
 * unit of change for that. So the questions are rows, and the interesting work
 * is checking an answer against a question that didn't exist when this code
 * was written.
 *
 * Nothing in this file touches the database, and that is load-bearing rather
 * than tidiness: the form somebody fills in is a client component, and one
 * value imported from a module that reaches Prisma pulls the whole client into
 * the browser bundle — where it throws on sight. The reads live in
 * lib/forms-query.ts.
 *
 * Two rules run through everything here:
 *
 *   - **An answer belongs to the field, not to the label.** Rename "Phone" to
 *     "Mobile" and every answer already given is still an answer to that
 *     question. Nothing keys on text.
 *   - **A field is never really deleted.** Removing one would leave a year of
 *     submissions with a column nobody can name, so it is only stopped from
 *     being asked. Reading old submissions still finds it.
 */

/** The subset of a field that validation and rendering actually need. */
export type Askable = Pick<
  FormField,
  "id" | "label" | "type" | "help" | "required" | "options" | "position"
>;

/** The offered choices of a field that offers any, in the order they were typed. */
export function optionsOf(field: Pick<Askable, "options">): string[] {
  return (field.options ?? "")
    .split("\n")
    .map((option) => option.trim())
    .filter(Boolean);
}

/** Whether this kind of question offers a fixed set of answers. */
export function isChoice(type: FormFieldType): boolean {
  return type === "SELECT" || type === "RADIO" || type === "CHECKBOXES";
}

/** How several chosen options are stored, and split back out. */
export const MULTI_SEPARATOR = "\n";

export type SubmissionErrors = Record<string, string>;

export type ValidatedSubmission = {
  /** fieldId -> the value to store. Fields left blank and not required are absent. */
  values: Record<string, string>;
  errors: SubmissionErrors;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Checks what somebody typed against the questions as they stand now.
 *
 * Pure, and the authority: the browser's own `required` and `type=email` are a
 * courtesy that a crafted POST walks straight past. In particular the options
 * of a choice field are checked against the offered list, so a request can't
 * invent a fourth answer to a three-way question and have it appear in the
 * export as though somebody picked it.
 */
export function validateSubmission(
  fields: readonly Askable[],
  raw: Record<string, unknown>,
): ValidatedSubmission {
  const values: Record<string, string> = {};
  const errors: SubmissionErrors = {};

  for (const field of fields) {
    const given = raw[field.id];

    if (field.type === "CHECKBOX") {
      // A single checkbox is a yes or a no, and "no" is an answer worth
      // keeping — a blank cell in the export would read as "never asked".
      const ticked = given === true || given === "true" || given === "on";
      if (field.required && !ticked) {
        errors[field.id] = "Please tick this to continue.";
        continue;
      }
      values[field.id] = ticked ? "Yes" : "No";
      continue;
    }

    if (field.type === "CHECKBOXES") {
      const offered = optionsOf(field);
      const chosen = (Array.isArray(given) ? given : given == null ? [] : [given])
        .map((value) => String(value))
        .filter((value) => offered.includes(value));
      if (field.required && chosen.length === 0) {
        errors[field.id] = "Please choose at least one.";
        continue;
      }
      if (chosen.length > 0) values[field.id] = chosen.join(MULTI_SEPARATOR);
      continue;
    }

    const value = given == null ? "" : String(given).trim();
    if (!value) {
      if (field.required) errors[field.id] = "This one's needed.";
      continue;
    }

    switch (field.type) {
      case "EMAIL":
        if (!EMAIL.test(value)) errors[field.id] = "That doesn't look like an email address.";
        break;
      case "NUMBER":
        if (!Number.isFinite(Number(value))) errors[field.id] = "Please give a number.";
        break;
      case "DATE":
        if (!ISO_DATE.test(value) || Number.isNaN(new Date(value).getTime())) {
          errors[field.id] = "Please give a date.";
        }
        break;
      case "SELECT":
      case "RADIO":
        if (!optionsOf(field).includes(value)) errors[field.id] = "Please choose one of the options.";
        break;
      default:
        if (value.length > 5000) errors[field.id] = "That's longer than this box takes.";
    }

    if (!errors[field.id]) values[field.id] = value;
  }

  return { values, errors };
}

/** One submission as a row of columns, for the screen and for the CSV. */
export function submissionRow(
  fields: readonly { id: string; label: string }[],
  answers: readonly { fieldId: string; value: string }[],
): Record<string, string> {
  const byField = new Map(answers.map((answer) => [answer.fieldId, answer.value]));
  const row: Record<string, string> = {};
  for (const field of fields) {
    // A newline inside a CSV cell is legal but unreadable; several chosen
    // options read better as a list on one line.
    row[field.label] = (byField.get(field.id) ?? "").split(MULTI_SEPARATOR).join(", ");
  }
  return row;
}

/**
 * The columns a submission list shows.
 *
 * Every field the form has *ever* asked, live ones first in their order and
 * retired ones after — because a submission from March answered questions that
 * are no longer on the form, and dropping those columns silently loses what
 * somebody actually said.
 */
export function columnsFor(
  fields: readonly (Askable & { deletedAt: Date | null })[],
): (Askable & { retired: boolean })[] {
  const live = fields.filter((field) => field.deletedAt === null).sort((a, b) => a.position - b.position);
  const retired = fields.filter((field) => field.deletedAt !== null).sort((a, b) => a.position - b.position);
  return [
    ...live.map((field) => ({ ...field, retired: false })),
    ...retired.map((field) => ({ ...field, retired: true })),
  ];
}
