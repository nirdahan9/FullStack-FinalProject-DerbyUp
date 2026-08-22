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
    // components/ui holds the shadcn/ui primitives, copied verbatim from the
    // DerbyUp app so the two products stay visually identical. It is vendored
    // third-party code that we do not hand-maintain, and upstream has not yet
    // adopted the React Compiler lint rules that ship with Next.js 16.
    // Linting it would mean editing files we want to keep byte-comparable
    // with their source. Everything we actually write is still linted.
    "components/ui/**",
    // Generated output, not source: the coverage report and Playwright's
    // artefacts are both gitignored and both contain vendored scripts.
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
