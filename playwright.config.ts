import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// The E2E suite drives the real app against the real Supabase project, so it
// needs the same variables `next dev` reads. Loaded here rather than duplicated
// into a second env file that could drift.
// Playwright loads this file as CommonJS, so import.meta is unavailable.
const envFile = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0 && !process.env[trimmed.slice(0, eq)]) {
      process.env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
    }
  }
}

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  // Each spec signs up its own users and builds its own fixtures against one
  // shared project; running them at once would have them tripping over
  // each other's rows.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? "line" : [["list"]],
  use: {
    baseURL,
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile",
      // The product is designed for a phone; the desktop layout is the same
      // tree at a wider breakpoint.
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000/login",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
