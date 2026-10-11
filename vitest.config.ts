import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(__dirname, "./src") };

/**
 * Two projects, split by file extension.
 *
 * The rules modules are pure and run in Node: fast, and it keeps the bulk of
 * the suite honest about having no DOM to lean on. Component tests need a
 * document, so `.test.tsx` runs under jsdom with the testing-library setup —
 * and nothing else does, so adding component tests did not slow the fifteen
 * hundred that came first.
 *
 * Projects rather than `environmentMatchGlobs`, which Vitest 4 removed.
 */
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
  },
});
