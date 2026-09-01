import { describe, expect, it } from "vitest";
import { possibleDuplicates } from "./duplicates";

const people = (...names: string[]) => names.map((displayName) => ({ displayName }));

describe("possibleDuplicates", () => {
  it("pairs a name with a longer one that starts the same way", () => {
    const found = possibleDuplicates(people("Dave", "Davey"));
    expect(found.map((pair) => pair.map((person) => person.displayName))).toEqual([
      ["Dave", "Davey"],
    ]);
  });

  it("ignores casing and spacing, which are what made the duplicate", () => {
    expect(possibleDuplicates(people("sarah", "Sarah J"))).toHaveLength(1);
  });

  // A looser rule pairs "Dan" with "Dawn" and "Jon" with "Jan"; an admin shown
  // three wrong suggestions stops reading the fourth.
  it("doesn't pair two different short names", () => {
    expect(possibleDuplicates(people("Dan", "Dawn"))).toEqual([]);
    expect(possibleDuplicates(people("Jon", "Jan"))).toEqual([]);
  });

  it("won't pair on a prefix shorter than three characters", () => {
    expect(possibleDuplicates(people("Jo", "Joe"))).toEqual([]);
  });

  it("won't pair names that diverge by more than a few characters", () => {
    expect(possibleDuplicates(people("Jon", "Jonathan"))).toEqual([]);
  });

  it("stops at the limit rather than listing every pair in a large church", () => {
    expect(possibleDuplicates(people("Ann", "Anna", "Annb", "Annc", "Annd", "Anne"), 2)).toHaveLength(2);
  });

  it("says nothing about a list with no near-duplicates", () => {
    expect(possibleDuplicates(people("Devin", "Cindy", "John"))).toEqual([]);
  });
});
