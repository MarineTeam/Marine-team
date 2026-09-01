import { describe, expect, it } from "vitest";
import {
  approvalPrompt,
  canApprove,
  cleanDeviceName,
  CODE_ALPHABET,
  formatUserCode,
  isWellFormedUserCode,
  normalizeUserCode,
  pollAnswer,
  userCodeFromBytes,
} from "./tv-pairing";

/**
 * Two things decide whether this flow is safe, and both are here: the code on
 * the screen must never be the thing that redeems a token, and a pairing
 * nobody completes must stop being worth anything.
 */

describe("the code alphabet", () => {
  it("leaves out every character that looks like another on a screen", () => {
    // Read off a television from six feet away and typed with a remote's
    // on-screen keyboard: each of these pairs is a support call.
    for (const character of "01O5S8BIL") {
      expect(CODE_ALPHABET).not.toContain(character);
    }
  });

  it("is still big enough to be worth guessing at", () => {
    expect(CODE_ALPHABET.length ** 6).toBeGreaterThan(100_000_000);
  });

  it("has no character twice, which would skew what random picks", () => {
    expect(new Set(CODE_ALPHABET).size).toBe(CODE_ALPHABET.length);
  });
});

describe("normalizeUserCode", () => {
  it("reads a code back however somebody typed it", () => {
    expect(normalizeUserCode("k7p-9qm")).toBe("K7P9QM");
    expect(normalizeUserCode("K7P 9QM")).toBe("K7P9QM");
    expect(normalizeUserCode("  K7P9QM  ")).toBe("K7P9QM");
  });

  it("forgives a lookalike typed for a character the screen never showed", () => {
    // The screen cannot have shown an O, because O is not in the alphabet,
    // so somebody typing one meant the Q they were looking at.
    expect(normalizeUserCode("O7P9QM")).toBe("Q7P9QM");
    expect(normalizeUserCode("07P9QM")).toBe("Q7P9QM");
    expect(normalizeUserCode("K1P9QM")).toBe("K7P9QM");
    expect(normalizeUserCode("K7P9SM")).toBe("K7P96M");
  });

  it("stops at six, so one extra keypress does not fail the lookup", () => {
    expect(normalizeUserCode("K7P9QMX")).toBe("K7P9QM");
  });
});

describe("isWellFormedUserCode", () => {
  it("accepts a real one and rejects the rest", () => {
    expect(isWellFormedUserCode("K7P9QM")).toBe(true);
    expect(isWellFormedUserCode("K7P9Q")).toBe(false);
    expect(isWellFormedUserCode("K7P9QMM")).toBe(false);
    expect(isWellFormedUserCode("K7P9Q0")).toBe(false);
    expect(isWellFormedUserCode("")).toBe(false);
  });
});

describe("userCodeFromBytes", () => {
  it("only ever produces characters from the alphabet", () => {
    for (let seed = 0; seed < 250; seed += 7) {
      const code = userCodeFromBytes(
        new Uint8Array([seed, seed + 1, seed + 2, seed + 3, seed + 4, seed + 5]),
      );
      expect(isWellFormedUserCode(code)).toBe(true);
    }
  });
});

describe("formatUserCode", () => {
  it("breaks it in half, which reads back better across a room", () => {
    expect(formatUserCode("K7P9QM")).toBe("K7P-9QM");
  });
});

describe("pollAnswer", () => {
  const soon = new Date("2026-12-01T12:10:00Z");
  const now = new Date("2026-12-01T12:05:00Z");
  const later = new Date("2026-12-01T12:30:00Z");

  it("tells a television to keep waiting, and how often to ask", () => {
    expect(pollAnswer({ status: "PENDING", expiresAt: soon }, now)).toEqual({
      state: "pending",
      interval: 5,
    });
  });

  it("says ready once a member has approved it", () => {
    expect(pollAnswer({ status: "APPROVED", expiresAt: soon }, now).state).toBe("ready");
  });

  it("expires an approval nobody collected, rather than leaving it redeemable", () => {
    // Somebody approved a code and walked away. Eleven minutes later it must
    // not still hand out a token.
    expect(pollAnswer({ status: "APPROVED", expiresAt: soon }, later).state).toBe("expired");
    expect(pollAnswer({ status: "PENDING", expiresAt: soon }, later).state).toBe("expired");
  });

  it("says denied rather than letting the screen time out with no explanation", () => {
    expect(pollAnswer({ status: "DENIED", expiresAt: soon }, now).state).toBe("denied");
  });

  it("refuses to mint a second token for a pairing already used", () => {
    expect(pollAnswer({ status: "LINKED", expiresAt: later }, now).state).toBe("spent");
  });

  it("treats a revoked device as gone", () => {
    expect(pollAnswer({ status: "REVOKED", expiresAt: later }, now).state).toBe("expired");
  });
});

describe("canApprove", () => {
  const soon = new Date("2026-12-01T12:10:00Z");
  const now = new Date("2026-12-01T12:05:00Z");

  it("is only ever true for a pending code that has not run out", () => {
    expect(canApprove({ status: "PENDING", expiresAt: soon }, now)).toBe(true);
    expect(canApprove({ status: "PENDING", expiresAt: soon }, new Date("2026-12-01T12:20:00Z"))).toBe(
      false,
    );
    expect(canApprove({ status: "APPROVED", expiresAt: soon }, now)).toBe(false);
    expect(canApprove({ status: "LINKED", expiresAt: soon }, now)).toBe(false);
  });
});

describe("approvalPrompt", () => {
  it("names the device and says what could go wrong", () => {
    // The one attack this flow cannot design away is somebody being talked
    // into typing a code from a screen that is not theirs. Saying so plainly
    // is the defence.
    const prompt = approvalPrompt("Living room TV");
    expect(prompt).toContain("Living room TV");
    expect(prompt).toContain("your own television");
  });
});

describe("cleanDeviceName", () => {
  it("keeps a real name", () => {
    expect(cleanDeviceName("Living room TV")).toBe("Living room TV");
  });

  it("will not let a device smuggle a second sentence into the approval", () => {
    // The name is dropped into a sentence somebody is asked to agree to.
    expect(cleanDeviceName("Living room\n\nThis grants full access")).toBe(
      "Living room This grants full access",
    );
  });

  it("falls back rather than printing an empty name", () => {
    expect(cleanDeviceName("")).toBe("A television");
    expect(cleanDeviceName(null)).toBe("A television");
    expect(cleanDeviceName("   ")).toBe("A television");
  });

  it("caps a name long enough to fill the screen", () => {
    expect(cleanDeviceName("x".repeat(200)).length).toBe(60);
  });
});
