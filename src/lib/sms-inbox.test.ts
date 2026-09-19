import { createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  genericSignatureIsValid,
  intoThreads,
  isOptIn,
  isOptOut,
  readGeneric,
  readTwilio,
  threadKey,
  twilioSignatureIsValid,
} from "./sms-inbox";

describe("threadKey", () => {
  it("normalises a number so one person is one thread", () => {
    expect(threadKey("+44 7700 900123")).toBe(threadKey("+447700900123"));
  });

  it("keeps an unreadable number rather than dropping the message", () => {
    // A reply from a number nobody recognises is still a reply.
    expect(threadKey("shortcode-12345")).toBe("shortcode-12345");
  });

  it("threads a number written down nationally with the reply that arrives internationally", () => {
    // The case that actually bites: a church types "07700 900123" into the
    // membership and the gateway delivers "+447700900123". Both sides have to
    // be read under the same country, or the sender is never recognised and
    // STOP is filed rather than acted on.
    expect(threadKey("07700 900123", "44")).toBe(threadKey("+447700900123", "44"));
  });

  it("leaves a national number alone when no country is configured", () => {
    // Guessing a country code texts a stranger abroad. Unthreaded is better.
    expect(threadKey("07700 900123")).toBe("07700 900123");
  });
});

describe("readTwilio", () => {
  const params = new URLSearchParams({ From: "+447700900123", Body: "Yes I can do Sunday", MessageSid: "SM1" });

  it("reads a form post", () => {
    const incoming = readTwilio(params)!;
    expect(incoming.from).toBe("+447700900123");
    expect(incoming.body).toBe("Yes I can do Sunday");
    expect(incoming.providerId).toBe("SM1");
  });

  it("keeps an empty body, which is a real thing a phone sends", () => {
    expect(readTwilio(new URLSearchParams({ From: "+44", Body: "" }))?.body).toBe("");
  });

  it("caps a body somebody sent a novel in", () => {
    const long = new URLSearchParams({ From: "+447700900123", Body: "a".repeat(5000) });
    expect(readTwilio(long)?.body).toHaveLength(2000);
  });

  it("refuses a post with no sender", () => {
    expect(readTwilio(new URLSearchParams({ Body: "hello" }))).toBeNull();
  });
});

describe("readGeneric", () => {
  it("reads the documented JSON shape", () => {
    expect(readGeneric({ id: "x1", from: "+44770", body: "hi" })).toMatchObject({
      providerId: "x1", from: "+44770", body: "hi",
    });
  });

  it("refuses anything else", () => {
    expect(readGeneric(null)).toBeNull();
    expect(readGeneric({ from: 44, body: "hi" })).toBeNull();
    expect(readGeneric({ from: "+44" })).toBeNull();
  });
});

describe("twilioSignatureIsValid", () => {
  const authToken = "token123";
  const url = "https://church.example/api/webhooks/sms";
  const params = new URLSearchParams({ From: "+447700900123", Body: "Yes", MessageSid: "SM1" });
  const sign = (u = url, p = params, t = authToken) => {
    let data = u;
    for (const key of [...p.keys()].sort()) data += key + p.getAll(key).join("");
    return createHmac("sha1", t).update(Buffer.from(data, "utf8")).digest("base64");
  };

  it("accepts a genuine post", () => {
    expect(twilioSignatureIsValid({ url, params, header: sign(), authToken })).toBe(true);
  });

  it("refuses an altered body", () => {
    const tampered = new URLSearchParams({ From: "+447700900123", Body: "No", MessageSid: "SM1" });
    expect(twilioSignatureIsValid({ url, params: tampered, header: sign(), authToken })).toBe(false);
  });

  it("refuses the right signature aimed at another URL", () => {
    expect(
      twilioSignatureIsValid({ url: "https://evil.example/hook", params, header: sign(), authToken }),
    ).toBe(false);
  });

  it("refuses another account's token, and a missing header", () => {
    expect(twilioSignatureIsValid({ url, params, header: sign(url, params, "other"), authToken })).toBe(false);
    expect(twilioSignatureIsValid({ url, params, header: null, authToken })).toBe(false);
    expect(twilioSignatureIsValid({ url, params, header: sign(), authToken: "" })).toBe(false);
  });

  it("refuses a signature that only starts right", () => {
    const good = sign();
    const nearly = `${good.slice(0, -1)}${good.endsWith("A") ? "B" : "A"}`;
    expect(twilioSignatureIsValid({ url, params, header: nearly, authToken })).toBe(false);
  });

  it("refuses everything when no token is configured, including a post signed with none", () => {
    // An unconfigured deployment must refuse, not verify against the empty
    // key — HMAC under "" is a perfectly computable signature that anybody
    // can produce. A mutant dropping the `!authToken` guard survived every
    // other case here, because they all sign with the real token.
    expect(twilioSignatureIsValid({ url, params, header: sign(url, params, ""), authToken: "" })).toBe(false);
  });

  it("refuses a post truncated to the length of the real signature", () => {
    expect(twilioSignatureIsValid({ url, params, header: sign().slice(0, 8), authToken })).toBe(false);
  });
});

describe("genericSignatureIsValid", () => {
  const secret = "s3cret";
  const body = '{"from":"+44","body":"hi"}';
  const now = new Date("2026-09-18T12:00:00Z");
  const sign = (t: number) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

  it("accepts a fresh signed post", () => {
    expect(genericSignatureIsValid({ body, header: sign(Math.floor(now.getTime() / 1000)), secret, now })).toBe(true);
  });

  it("refuses a replay from an hour ago", () => {
    expect(genericSignatureIsValid({ body, header: sign(Math.floor(now.getTime() / 1000) - 3600), secret, now })).toBe(false);
  });

  it("refuses a tampered body and nonsense headers", () => {
    expect(genericSignatureIsValid({ body: `${body} `, header: sign(Math.floor(now.getTime() / 1000)), secret, now })).toBe(false);
    expect(genericSignatureIsValid({ body, header: "nope", secret, now })).toBe(false);
    expect(genericSignatureIsValid({ body, header: null, secret, now })).toBe(false);
  });

  it("refuses a signature that only starts right", () => {
    // The same gap the giving webhook's tests had: a signature from the wrong
    // secret differs in its first byte, so a loose compare passes every other
    // case. This one shares all but the last, and one is simply truncated.
    const timestamp = Math.floor(now.getTime() / 1000);
    const good = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
    const nearly = `${good.slice(0, -1)}${good.endsWith("a") ? "b" : "a"}`;
    expect(genericSignatureIsValid({ body, header: `t=${timestamp},v1=${nearly}`, secret, now })).toBe(false);
    expect(genericSignatureIsValid({ body, header: `t=${timestamp},v1=${good.slice(0, 16)}`, secret, now })).toBe(false);
  });

  it("refuses a delivery stamped well into the future", () => {
    // Not just old ones: a timestamp an hour ahead is either a clock nobody
    // has noticed or somebody buying themselves a replay window.
    expect(
      genericSignatureIsValid({ body, header: sign(Math.floor(now.getTime() / 1000) + 3600), secret, now }),
    ).toBe(false);
  });

  it("refuses everything when no secret is configured", () => {
    // As above: HMAC under the empty key is computable by anyone.
    const timestamp = Math.floor(now.getTime() / 1000);
    const underNothing = createHmac("sha256", "").update(`${timestamp}.${body}`).digest("hex");
    expect(
      genericSignatureIsValid({ body, header: `t=${timestamp},v1=${underNothing}`, secret: "", now }),
    ).toBe(false);
  });
});

describe("intoThreads", () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 8, 18, 12, minute));
  const rows = [
    { id: "1", phone: "+441", who: "Ruth", direction: "OUTBOUND" as const, body: "Can you do Sunday?", createdAt: at(0), readAt: null },
    { id: "2", phone: "+441", who: null, direction: "INBOUND" as const, body: "Yes", createdAt: at(5), readAt: null },
    { id: "3", phone: "+442", who: null, direction: "INBOUND" as const, body: "Who is this?", createdAt: at(3), readAt: at(4) },
  ];

  it("gathers by number", () => {
    const threads = intoThreads(rows);
    expect(threads).toHaveLength(2);
    expect(threads[0].phone).toBe("+441");
    expect(threads[0].messages.map((m) => m.id)).toEqual(["1", "2"]);
  });

  it("orders by most recent activity, not by unread", () => {
    // Sorting by unread buries a conversation the moment somebody opens it.
    expect(intoThreads(rows).map((t) => t.phone)).toEqual(["+441", "+442"]);
  });

  it("counts only unread inbound messages", () => {
    const threads = intoThreads(rows);
    expect(threads.find((t) => t.phone === "+441")!.unread).toBe(1);
    expect(threads.find((t) => t.phone === "+442")!.unread).toBe(0);
  });

  it("names the thread from whichever message knew who it was", () => {
    expect(intoThreads(rows)[0].who).toBe("Ruth");
    expect(intoThreads(rows)[1].who).toBeNull();
  });
});

describe("isOptOut and isOptIn", () => {
  it("recognises the words that are a legal instruction", () => {
    for (const word of ["STOP", "stop", " Stop. ", "UNSUBSCRIBE", "cancel", "QUIT"]) {
      expect(isOptOut(word), word).toBe(true);
    }
  });

  it("does not treat an ordinary reply as one", () => {
    for (const word of ["Stop by any time", "I'll stop in", "yes please"]) {
      expect(isOptOut(word), word).toBe(false);
    }
  });

  it("recognises coming back, which the same rules require", () => {
    expect(isOptIn("START")).toBe(true);
    expect(isOptIn("yes")).toBe(true);
    expect(isOptIn("yes please")).toBe(false);
  });
});
