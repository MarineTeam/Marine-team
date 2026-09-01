import { describe, expect, it } from "vitest";
import { columnsFor, optionsOf, submissionRow, validateSubmission, type Askable } from "./forms";

/**
 * The browser's own `required` and `type=email` are a courtesy that a crafted
 * POST walks straight past, so these rules are the authority. The one worth
 * being most careful about is the option check: without it a request can
 * invent a fourth answer to a three-way question and have it turn up in the
 * export as though somebody had picked it.
 */

const field = (over: Partial<Askable> & { id: string }): Askable => ({
  label: "Question",
  type: "TEXT",
  help: null,
  required: false,
  options: null,
  position: 0,
  ...over,
});

describe("optionsOf", () => {
  it("reads one option per line and ignores the blank ones", () => {
    expect(optionsOf({ options: "Yes\n\n  No  \nMaybe\n" })).toEqual(["Yes", "No", "Maybe"]);
  });

  it("is empty for a field that offers no choices", () => {
    expect(optionsOf({ options: null })).toEqual([]);
  });
});

describe("validateSubmission", () => {
  it("keeps what was given and trims it", () => {
    const { values, errors } = validateSubmission([field({ id: "a" })], { a: "  Ade  " });
    expect(values).toEqual({ a: "Ade" });
    expect(errors).toEqual({});
  });

  it("asks again for a required field left blank", () => {
    const { values, errors } = validateSubmission([field({ id: "a", required: true })], { a: "   " });
    expect(errors.a).toBeTruthy();
    expect(values.a).toBeUndefined();
  });

  it("leaves an optional blank out rather than storing an empty answer", () => {
    expect(validateSubmission([field({ id: "a" })], {}).values).toEqual({});
  });

  it("checks an email, a number and a date", () => {
    const fields = [
      field({ id: "e", type: "EMAIL" }),
      field({ id: "n", type: "NUMBER" }),
      field({ id: "d", type: "DATE" }),
    ];
    expect(validateSubmission(fields, { e: "nope", n: "seven", d: "31/12/2026" }).errors).toEqual({
      e: expect.any(String),
      n: expect.any(String),
      d: expect.any(String),
    });
    expect(
      validateSubmission(fields, { e: "a@b.co", n: "7", d: "2026-12-31" }).errors,
    ).toEqual({});
  });

  it("refuses an answer to a choice question that was never offered", () => {
    const one = field({ id: "c", type: "RADIO", options: "Yes\nNo" });
    expect(validateSubmission([one], { c: "Absolutely" }).errors.c).toBeTruthy();
    expect(validateSubmission([one], { c: "No" }).values.c).toBe("No");
  });

  it("drops uninvited options out of a multi-choice rather than storing them", () => {
    const many = field({ id: "c", type: "CHECKBOXES", options: "Tea\nCoffee" });
    const { values } = validateSubmission([many], { c: ["Tea", "Brandy", "Coffee"] });
    expect(values.c).toBe("Tea\nCoffee");
  });

  it("treats a lone unticked checkbox as an answer, not as silence", () => {
    // A blank cell in the export would read as "we never asked".
    const consent = field({ id: "k", type: "CHECKBOX" });
    expect(validateSubmission([consent], {}).values.k).toBe("No");
    expect(validateSubmission([consent], { k: true }).values.k).toBe("Yes");
  });

  it("won't let a required checkbox through unticked", () => {
    const consent = field({ id: "k", type: "CHECKBOX", required: true });
    expect(validateSubmission([consent], {}).errors.k).toBeTruthy();
    expect(validateSubmission([consent], { k: true }).errors).toEqual({});
  });

  it("ignores anything sent for a field the form doesn't ask", () => {
    const { values } = validateSubmission([field({ id: "a" })], { a: "x", sneaky: "y" });
    expect(values).toEqual({ a: "x" });
  });

  it("requires at least one box of a required multi-choice", () => {
    const many = field({ id: "c", type: "CHECKBOXES", options: "Tea\nCoffee", required: true });
    expect(validateSubmission([many], { c: [] }).errors.c).toBeTruthy();
  });
});

describe("columnsFor", () => {
  const live = (id: string, position: number) => ({
    ...field({ id, label: id, position }),
    deletedAt: null,
  });
  const retired = (id: string, position: number) => ({
    ...field({ id, label: id, position }),
    deletedAt: new Date(),
  });

  it("keeps a retired question as a column, after the live ones", () => {
    // A submission from March answered questions no longer on the form.
    // Dropping those columns loses what somebody actually said.
    const columns = columnsFor([retired("old", 0), live("b", 2), live("a", 1)]);
    expect(columns.map((column) => column.id)).toEqual(["a", "b", "old"]);
    expect(columns.map((column) => column.retired)).toEqual([false, false, true]);
  });
});

describe("submissionRow", () => {
  const fields = [
    { id: "a", label: "Name" },
    { id: "b", label: "Drink" },
    { id: "c", label: "Never answered" },
  ];

  it("lays the answers out under their labels", () => {
    expect(
      submissionRow(fields, [
        { fieldId: "a", value: "Ade" },
        { fieldId: "b", value: "Tea\nCoffee" },
      ]),
    ).toEqual({ Name: "Ade", Drink: "Tea, Coffee", "Never answered": "" });
  });
});
