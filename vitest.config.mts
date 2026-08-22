import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

const alias = { "@": path.resolve(import.meta.dirname, "./") };

/**
 * Three suites, split because they need different environments and different
 * things to be available:
 *
 *   unit        — pure functions, no I/O. Runs anywhere, in milliseconds.
 *   components  — jsdom + React Testing Library.
 *   integration — a real Supabase project. Needs .env.local, so it is not part
 *                 of `npm test`; `npm run test:integration` runs it.
 *
 * Coverage thresholds stay on lib/domain and lib/validation: those are the
 * files the test spec sets a 90% target for, and they are covered by the unit
 * suite alone, so the number means the same thing whether or not a database
 * happens to be reachable.
 */
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["lib/domain/**/*.ts", "lib/validation/**/*.ts"],
      // text-summary plus the HTML report: the flat text table collapses to
      // nothing when every file sits under a shared prefix, and coverage/index.html
      // has the per-file breakdown anyway.
      reporter: ["text-summary", "html"],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "components",
          environment: "jsdom",
          include: ["tests/components/**/*.test.tsx"],
          setupFiles: ["tests/components/setup.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          // Every suite builds its own world of users, leagues and fixtures
          // against one shared project. Running them in parallel would have
          // them competing over the same rows.
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
