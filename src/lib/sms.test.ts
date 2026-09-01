import { describe, expect, it } from "vitest";
import { normalizePhone, smsSegments } from "./sms";

/**
 * Two things worth being careful about before a text goes out to three hundred
 * people: that the number is the number, and that somebody knows what it will
 * cost.
 */

describe("normalizePhone", () => {
  it("keeps a number that is already international", () => {
    expect(normalizePhone("+447700900123")).toBe("+447700900123");
    expect(normalizePhone(" +44 7700 900 123 ")).toBe("+447700900123");
    expect(normalizePhone("+44 (0)7700-900123")).toBe("+4407700900123");
  });

  it("reads 00 as the other way of writing +", () => {
    expect(normalizePhone("00447700900123")).toBe("+447700900123");
  });

  it("adds a country code to a national number and drops the trunk zero", () => {
    expect(normalizePhone("07700 900123", "44")).toBe("+447700900123");
    expect(normalizePhone("7700900123", "44")).toBe("+447700900123");
  });

  it("refuses a national number with no country code to add rather than guessing", () => {
    // Guessing sends somebody in another country a message about a church
    // they have never heard of.
    expect(normalizePhone("07700900123")).toBe(null);
  });

  it("refuses something that isn't a phone number", () => {
    expect(normalizePhone("ask Ruth")).toBe(null);
    expect(normalizePhone("+123")).toBe(null);
    expect(normalizePhone("")).toBe(null);
    expect(normalizePhone(null)).toBe(null);
    expect(normalizePhone(undefined)).toBe(null);
  });

  it("refuses one longer than any real number", () => {
    expect(normalizePhone("+1234567890123456789")).toBe(null);
  });
});

describe("smsSegments", () => {
  it("fits 160 plain characters in one message", () => {
    expect(smsSegments("a".repeat(160))).toEqual({ segments: 1, unicode: false, length: 160 });
  });

  it("spills into two at 161, which are 153 each once split", () => {
    expect(smsSegments("a".repeat(161)).segments).toBe(2);
    expect(smsSegments("a".repeat(306)).segments).toBe(2);
    expect(smsSegments("a".repeat(307)).segments).toBe(3);
  });

  it("charges two places for the bracket-family characters, as the standard does", () => {
    expect(smsSegments("[").length).toBe(2);
    expect(smsSegments("a".repeat(159) + "[").segments).toBe(2);
  });

  it("halves the allowance for one character outside the 7-bit set", () => {
    // A curly apostrophe pasted out of a word processor genuinely does this,
    // which is the entire reason this is on the screen before sending.
    const plain = smsSegments("It's on at seven".repeat(6));
    const curly = smsSegments("It’s on at seven".repeat(6));
    expect(plain.unicode).toBe(false);
    expect(curly.unicode).toBe(true);
    expect(curly.segments).toBeGreaterThan(plain.segments);
  });

  it("counts an emoji as the two units it costs", () => {
    expect(smsSegments("🙂").length).toBe(2);
  });

  it("never reports zero messages, even for nothing", () => {
    expect(smsSegments("").segments).toBe(1);
  });
});
