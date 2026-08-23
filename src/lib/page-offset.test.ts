import { describe, expect, it } from "vitest";
import { pdfPageOf, printedPage } from "./page-offset";

describe("printedPage", () => {
  it("is the PDF page itself when a book has no front matter", () => {
    expect(printedPage(45, 0)).toBe(45);
  });

  it("subtracts the front matter, so a ten-page contents puts printed 1 on PDF 11", () => {
    expect(printedPage(11, 10)).toBe(1);
    expect(printedPage(55, 10)).toBe(45);
  });

  it("returns null inside the front matter rather than a zero or negative page", () => {
    expect(printedPage(10, 10)).toBeNull();
    expect(printedPage(3, 10)).toBeNull();
  });

  it("handles a negative offset, for a scan that starts partway into a book", () => {
    expect(printedPage(1, -4)).toBe(5);
  });
});

describe("pdfPageOf", () => {
  it("is the printed page itself when a book has no front matter", () => {
    expect(pdfPageOf(45, 0)).toBe(45);
  });

  it("adds the front matter back on", () => {
    expect(pdfPageOf(1, 10)).toBe(11);
    expect(pdfPageOf(45, 10)).toBe(55);
  });

  it("leaves an out-of-range value alone for the reader to clamp", () => {
    expect(pdfPageOf(0, 10)).toBe(10);
    expect(pdfPageOf(-3, 10)).toBe(7);
  });

  it("inverts printedPage, so a round trip through the page box stays put", () => {
    for (const offset of [0, 10, -4]) {
      for (const pdf of [11, 55, 120]) {
        const printed = printedPage(pdf, offset);
        expect(printed === null ? pdf : pdfPageOf(printed, offset)).toBe(pdf);
      }
    }
  });
});
