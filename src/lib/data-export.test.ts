import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FORBIDDEN_KEYS,
  assertExportSafe,
  exportFilename,
  pushServiceOf,
  totalRecords,
  unsafeKeysIn,
} from "./data-export";

describe("unsafeKeysIn", () => {
  it("finds a credential nested inside an array", () => {
    // The case that matters: an export is almost entirely lists, so a walk that
    // only descended into objects would pass on every real document and catch
    // nothing at all.
    const doc = { devices: { push: [{ pushService: "https://x" }, { endpoint: "…", auth: "secret-key" }] } };
    expect(unsafeKeysIn(doc)).toEqual(["$.devices.push[1].auth"]);
  });

  it("finds one buried several objects deep", () => {
    expect(unsafeKeysIn({ a: { b: { c: { tokenHash: "…" } } } })).toEqual(["$.a.b.c.tokenHash"]);
  });

  it("matches the whole key, not a prefix of it", () => {
    // `auth` is forbidden; `auth0Id` is the member's own identifier and belongs
    // in the file. A substring match would refuse to export anybody.
    expect(unsafeKeysIn({ account: { auth0Id: "google-oauth2|1" } })).toEqual([]);
  });

  it("reports every offender, not just the first", () => {
    expect(unsafeKeysIn({ a: { secret: 1 }, b: { salt: 2 } })).toEqual(["$.a.secret", "$.b.salt"]);
  });

  it("is quiet on a document that only holds facts", () => {
    expect(unsafeKeysIn({ account: { email: "a@b.c" }, comments: [{ body: "hello" }] })).toEqual([]);
  });

  it("covers every key it claims to", () => {
    for (const key of FORBIDDEN_KEYS) {
      expect(unsafeKeysIn({ rows: [{ [key]: "x" }] })).toEqual([`$.rows[0].${key}`]);
    }
  });
});

describe("assertExportSafe", () => {
  it("throws, naming the path, rather than quietly stripping it", () => {
    // Stripping would hide the fact that a query started selecting a
    // credential. A failed export is recoverable; a leaked push key isn't.
    expect(() => assertExportSafe({ devices: { push: [{ p256dh: "…" }] } })).toThrow(
      "Refusing to export: $.devices.push[0].p256dh",
    );
  });

  it("passes a clean document", () => {
    expect(() => assertExportSafe({ comments: [{ body: "hi" }] })).not.toThrow();
  });
});

describe("exportFilename", () => {
  it("names the file after the member and the day", () => {
    expect(exportFilename("alice@example.com", new Date("2026-09-02T11:00:00Z"))).toBe(
      "marine-team-alice-2026-09-02.json",
    );
  });

  it("keeps the name safe for a Content-Disposition header", () => {
    expect(exportFilename('a"b c@example.com', new Date("2026-01-05T00:00:00Z"))).toBe(
      "marine-team-a-b-c-2026-01-05.json",
    );
  });

  it("falls back when there is nothing nameable in the address", () => {
    expect(exportFilename("!!!@example.com", new Date("2026-01-05T00:00:00Z"))).toBe(
      "marine-team-member-2026-01-05.json",
    );
  });
});

describe("pushServiceOf", () => {
  it("keeps the service and drops the part that identifies the browser", () => {
    expect(pushServiceOf("https://fcm.googleapis.com/fcm/send/abc123-secret")).toBe("https://fcm.googleapis.com");
  });

  it("says unknown rather than passing an unparseable endpoint through whole", () => {
    expect(pushServiceOf("not-a-url")).toBe("unknown");
  });
});

describe("totalRecords", () => {
  it("counts nested lists, not just top-level ones", () => {
    const doc = { library: { playlists: [{ videos: [{}, {}] }, { videos: [] }] } };
    expect(totalRecords(doc)).toBe(4);
  });

  it("is zero for a document holding no lists", () => {
    expect(totalRecords({ account: { email: "a@b.c" } })).toBe(0);
  });
});

describe("the queries behind the export", () => {
  /**
   * Comments stripped, so the checks below read code rather than prose — the
   * file explains in words why it uses `select` over `include`, and a scan that
   * counted that sentence would fail on the very file it is describing.
   */
  const source = withoutComments(readFileSync(join(__dirname, "data-export-query.ts"), "utf8"));

  function withoutComments(text: string): string {
    return text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*)/.test(line))
      .join("\n");
  }

  /** Each `prisma.<model>.<op>(…)` call in the file, with its arguments. */
  function prismaCalls(text: string): { call: string; args: string }[] {
    const calls: { call: string; args: string }[] = [];
    const opener = /prisma\.(\w+)\.(\w+)\(/g;
    for (let match = opener.exec(text); match !== null; match = opener.exec(text)) {
      let depth = 1;
      let index = opener.lastIndex;
      while (index < text.length && depth > 0) {
        if (text[index] === "(") depth += 1;
        if (text[index] === ")") depth -= 1;
        index += 1;
      }
      calls.push({ call: `prisma.${match[1]}.${match[2]}`, args: text.slice(opener.lastIndex, index - 1) });
    }
    return calls;
  }

  it("scopes every read to one member", () => {
    // A findMany that forgets its `where` exports the whole congregation, and
    // it does it silently — the file just looks bigger than expected.
    const calls = prismaCalls(source);
    expect(calls.length).toBeGreaterThan(20);
    for (const { call, args } of calls) {
      expect(args, `${call} is not scoped to a user`).toMatch(/\.\.\.where|userId/);
    }
  });

  it("names every column it selects", () => {
    // `include` takes whole related rows, which is how a neighbour's phone
    // number ends up in somebody's downloads folder. `select` makes each
    // column a decision somebody made on purpose.
    expect(source).not.toMatch(/\binclude:/);
  });

  it("ignores prose, not code", () => {
    // The comment-stripper must not take a `select:` line with it.
    expect(withoutComments("/* include: bad */\nselect: { title: true }, // include: bad")).toContain("select:");
    expect(withoutComments("/* include: bad */\nselect: { title: true },")).not.toContain("include:");
  });

  it("finds the calls it is checking", () => {
    // Guards the two tests above: if the scan stopped matching, they would both
    // pass on an empty list and prove nothing.
    const calls = prismaCalls("await prisma.comment.findMany({ where: { userId } });");
    expect(calls).toEqual([{ call: "prisma.comment.findMany", args: "{ where: { userId } }" }]);
  });
});
