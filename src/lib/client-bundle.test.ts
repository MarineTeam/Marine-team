import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No client component may reach the database module.
 *
 * `lib/db.ts` constructs a PrismaClient. A component marked `"use client"` is
 * bundled for the browser, and one *value* imported from a module that
 * transitively imports `lib/db` drags the whole client in with it — where it
 * throws "PrismaClient is unable to run in this browser environment" on sight
 * and the page renders "This page couldn't load".
 *
 * Nothing catches this: it type-checks, it lints, and it builds. It fails in
 * the browser, on one route, at run time. So it is checked here instead.
 *
 * Type-only imports are fine and are skipped — they are erased before any
 * bundling happens, which is why a client component may freely import a type
 * from a module full of queries.
 */

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FORBIDDEN = "@/lib/db";

/** Value imports of the app's own modules, `import type` deliberately skipped. */
function importsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const found: string[] = [];
  // `[^;]*?` rather than `[\s\S]*?`: a multi-line import list contains no
  // semicolon, but a lazy any-character middle happily swallows two whole
  // statements and reports the second one's specifier under the first one's
  // `type` keyword — which is how this check first talked itself out of a
  // real finding.
  const pattern = /^\s*import\s+(type\s+)?([^;]*?)from\s+["'](@\/[^"']+)["']/gm;
  for (const match of source.matchAll(pattern)) {
    // `import type { X } from` is erased; `import { type X, y } from` is not.
    if (match[1]) continue;
    found.push(match[3]);
  }
  return found;
}

/** An `@/…` specifier as a path on disk, trying the extensions Next resolves. */
function resolve(specifier: string): string | null {
  const base = path.join(SRC, specifier.slice("@/".length));
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    try {
      readFileSync(candidate, "utf8");
      return candidate;
    } catch {
      // Not this extension.
    }
  }
  return null;
}

/** The chain from a client component to lib/db, or null if there isn't one. */
function pathToDatabase(entry: string): string[] | null {
  const seen = new Set<string>();
  const queue: { file: string; chain: string[] }[] = [
    { file: entry, chain: [path.relative(SRC, entry)] },
  ];

  while (queue.length > 0) {
    const { file, chain } = queue.shift() as { file: string; chain: string[] };
    if (seen.has(file)) continue;
    seen.add(file);

    for (const specifier of importsOf(file)) {
      if (specifier === FORBIDDEN) return [...chain, FORBIDDEN];
      const next = resolve(specifier);
      if (next) queue.push({ file: next, chain: [...chain, specifier] });
    }
  }
  return null;
}

/** Every .ts/.tsx under src, without depending on a glob that @types/node hasn't caught up with. */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const clientComponents = sourceFiles(SRC).filter((file) =>
  /^\s*["']use client["']/.test(readFileSync(file, "utf8").slice(0, 200)),
);

describe("what ends up in the browser bundle", () => {
  it("finds the client components to check", () => {
    // A glob that quietly matched nothing would make every assertion below
    // pass while checking absolutely nothing.
    expect(clientComponents.length).toBeGreaterThan(10);
  });

  it.each(clientComponents.map((file) => [path.relative(SRC, file), file] as const))(
    "%s doesn't reach the database",
    (_name: string, file: string) => {
      const chain = pathToDatabase(file);
      expect(chain === null ? null : chain.join(" → ")).toBe(null);
    },
  );
});
