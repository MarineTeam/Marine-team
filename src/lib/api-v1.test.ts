import { describe, it, expect } from "vitest";
import { API_VERSION, fail, ok, pageArgs, pageFrom, pageOut, updatedSince } from "./api-v1";

const at = (path: string) => new URL(`https://example.com${path}`);

describe("ok", () => {
  it("wraps rows in one envelope", async () => {
    const response = ok([{ id: "a" }]);
    expect(await response.json()).toEqual({ data: [{ id: "a" }] });
    expect(response.headers.get("X-Api-Version")).toBe(API_VERSION);
  });

  it("never lets an answer be cached by something shared", () => {
    // Every answer depends on which key asked, and some carry names.
    expect(ok([]).headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("leaves nextCursor out on the last page rather than sending null", async () => {
    // A caller can then loop on `while (body.nextCursor)` without a null check.
    expect(await ok([], { nextCursor: null }).json()).toEqual({ data: [] });
    expect(await ok([], { nextCursor: "abc" }).json()).toEqual({ data: [], nextCursor: "abc" });
  });

  it("refuses to answer with a credential in it", () => {
    // The same guard the data export uses — this is the last thing between a
    // selected column and somebody else's server.
    expect(() => ok([{ id: "a", hashedKey: "…" }])).toThrow(/Refusing to answer/);
    expect(() => ok({ nested: { rows: [{ calendarToken: "…" }] } })).toThrow(/calendarToken/);
    expect(() => ok([{ id: "a", title: "fine" }])).not.toThrow();
  });
});

describe("fail", () => {
  it("has one shape with a code a program can branch on", async () => {
    const response = fail(403, "missing_scope", "This key doesn't have it.");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: "missing_scope", message: "This key doesn't have it." } });
  });

  it("sends Retry-After only when there is something to wait for", () => {
    expect(fail(429, "rate_limited", "Too fast.", 42).headers.get("Retry-After")).toBe("42");
    expect(fail(404, "not_found", "No.").headers.get("Retry-After")).toBeNull();
  });
});

describe("paging", () => {
  it("asks for one row more than the page, to know whether there is another", () => {
    // The alternative is a COUNT over the whole table, which on a big
    // catalogue costs more than the page itself.
    expect(pageArgs({ take: 25, cursor: null })).toEqual({ take: 26 });
  });

  it("skips the cursor row itself, so a page never repeats its predecessor's last row", () => {
    expect(pageArgs({ take: 10, cursor: "v9" })).toEqual({ take: 11, cursor: { id: "v9" }, skip: 1 });
  });

  it("hands back the page and the cursor when there is more", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(pageOut(rows, { take: 2, cursor: null })).toEqual({ rows: [{ id: "a" }, { id: "b" }], nextCursor: "b" });
  });

  it("says there is no more when the extra row didn't come back", () => {
    const rows = [{ id: "a" }, { id: "b" }];
    expect(pageOut(rows, { take: 2, cursor: null })).toEqual({ rows, nextCursor: null });
    expect(pageOut([], { take: 2, cursor: null })).toEqual({ rows: [], nextCursor: null });
  });

  it("reads limit and cursor off the query string", () => {
    expect(pageFrom(at("/x?limit=5&cursor=abc"))).toEqual({ take: 5, cursor: "abc" });
    expect(pageFrom(at("/x"))).toEqual({ take: 25, cursor: null });
    expect(pageFrom(at("/x?limit=9999")).take).toBe(100);
  });
});

describe("updatedSince", () => {
  it("reads a timestamp", () => {
    expect(updatedSince(at("/x?updatedSince=2026-01-01T00:00:00Z"))?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("ignores one it can't read rather than refusing the request", () => {
    // A sync job that dies on a malformed timestamp it generated itself is a
    // worse outcome than one that over-fetches.
    expect(updatedSince(at("/x?updatedSince=yesterday"))).toBeUndefined();
    expect(updatedSince(at("/x"))).toBeUndefined();
  });
});
