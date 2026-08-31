import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendor builds copied out of node_modules at install/build time for the
    // offline shell (scripts/copy-offline-viewers.mjs). Minified third-party
    // bundles are not this project's code to lint, and CI lints the whole
    // tree — keep these in step with the same paths in .gitignore.
    "public/pdfjs/**",
    "public/epubjs/**",
  ]),
]);

export default eslintConfig;
