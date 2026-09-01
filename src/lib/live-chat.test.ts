import { describe, expect, it } from "vitest";
import {
  chatState,
  cleanMessage,
  visibleMessages,
  waitSeconds,
  type MessageRow,
} from "./live-chat";

/**
 * An open comment box on a church website is a liability unless three things
 * hold: it is only open while somebody is watching, one person can't drown
 * out everybody else, and a message a moderator took down stays down.
 */

const stream = (over: Partial<{ chatEnabled: boolean; startAt: Date; endAt: Date | null }> = {}) => ({
  chatEnabled: true,
  startAt: new Date("2026-12-24T18:00:00Z"),
  endAt: new Date("2026-12-24T19:30:00Z") as Date | null,
  ...over,
});

describe("chatState", () => {
  it("is open during the stream", () => {
    expect(chatState(stream(), new Date("2026-12-24T18:30:00Z"))).toBe("open");
  });

  it("opens half an hour early, so people arriving can say hello", () => {
    expect(chatState(stream(), new Date("2026-12-24T17:35:00Z"))).toBe("open");
    expect(chatState(stream(), new Date("2026-12-24T17:00:00Z"))).toBe("not-yet");
  });

  it("stays open an hour after, so the conversation isn't cut off mid-sentence", () => {
    expect(chatState(stream(), new Date("2026-12-24T20:15:00Z"))).toBe("open");
  });

  it("closes, rather than standing open on last year's carol service", () => {
    // An unattended comment box is exactly where the thing you don't want
    // written gets written.
    expect(chatState(stream(), new Date("2026-12-26T12:00:00Z"))).toBe("ended");
  });

  it("gives a stream with no end time a sensible one rather than for ever", () => {
    const open = stream({ endAt: null });
    expect(chatState(open, new Date("2026-12-24T20:00:00Z"))).toBe("open");
    expect(chatState(open, new Date("2026-12-25T09:00:00Z"))).toBe("ended");
  });

  it("is off when the chat was never switched on", () => {
    expect(chatState(stream({ chatEnabled: false }), new Date("2026-12-24T18:30:00Z"))).toBe("off");
  });
});

describe("cleanMessage", () => {
  it("keeps what somebody wrote", () => {
    expect(cleanMessage("  Praying for you all  ")).toEqual({ ok: true, body: "Praying for you all" });
  });

  it("collapses the shouting a length limit doesn't stop", () => {
    const shout = cleanMessage("HELLO\n\n\n\n\n\n\nHELLO");
    expect(shout).toEqual({ ok: true, body: "HELLO\n\nHELLO" });
    expect(cleanMessage("a      b")).toEqual({ ok: true, body: "a b" });
  });

  it("refuses nothing at all", () => {
    expect(cleanMessage("   \n  ").ok).toBe(false);
    expect(cleanMessage("").ok).toBe(false);
  });

  it("refuses an essay", () => {
    const long = cleanMessage("a".repeat(501));
    expect(long.ok).toBe(false);
    expect(cleanMessage("a".repeat(500)).ok).toBe(true);
  });
});

describe("waitSeconds", () => {
  const now = new Date("2026-12-24T18:00:30Z");

  it("is nothing when slow mode is off", () => {
    expect(waitSeconds(new Date("2026-12-24T18:00:29Z"), 0, now)).toBe(0);
  });

  it("is nothing for somebody who hasn't written yet", () => {
    expect(waitSeconds(null, 10, now)).toBe(0);
  });

  it("counts down from their own last message, not the chat's", () => {
    // Per person: limiting the whole chat would let one fast typist silence
    // everybody else.
    expect(waitSeconds(new Date("2026-12-24T18:00:26Z"), 10, now)).toBe(6);
  });

  it("is nothing once the wait has passed", () => {
    expect(waitSeconds(new Date("2026-12-24T18:00:00Z"), 10, now)).toBe(0);
  });
});

describe("visibleMessages", () => {
  const rows: MessageRow[] = [
    { id: "1", userId: "u1", authorName: "Ade", body: "Hello", hidden: false, createdAt: new Date() },
    { id: "2", userId: "u2", authorName: "Bea", body: "Taken down", hidden: true, createdAt: new Date() },
  ];

  it("never delivers a hidden message, even to a poll that was behind", () => {
    expect(visibleMessages(rows, { userId: "u1", moderates: false }).map((m) => m.id)).toEqual(["1"]);
    expect(visibleMessages(rows, { userId: "u1", moderates: true }).map((m) => m.id)).toEqual(["1"]);
  });

  it("carries no account id out to anybody", () => {
    const shown = visibleMessages(rows, { userId: "u1", moderates: false });
    expect(JSON.stringify(shown)).not.toContain("u1");
  });

  it("says who may take a message down", () => {
    expect(visibleMessages(rows, { userId: "u1", moderates: false })[0].canRemove).toBe(true);
    expect(visibleMessages(rows, { userId: "other", moderates: false })[0].canRemove).toBe(false);
    expect(visibleMessages(rows, { userId: "other", moderates: true })[0].canRemove).toBe(true);
  });
});
