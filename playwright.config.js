// @ts-check
import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "dist");

// The credential-gated tests read process.env, but the project keeps its secrets
// in the git-ignored .env.local, so load them here. Real env vars win, which is
// what lets CI supply the same values without a file.
for (const rawLine of fs.readFileSync(path.resolve(__dirname, ".env.local"), "utf8").split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) continue;
  const separator = line.indexOf("=");
  if (separator < 1) continue;
  const key = line.slice(0, separator).trim();
  if (process.env[key] !== undefined) continue;
  process.env[key] = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
}

/**
 * Playwright config for Tab Garden Chrome extension E2E tests.
 *
 * To make MV3 extensions load reliably we use `launchPersistentContext`
 * together with `channel: "chromium"`. The channel matters: Playwright's
 * default headless binary is the headless shell, which never registers an
 * extension service worker, whereas the full Chromium build does so headless
 * in about 3s. A worker-scoped fixture in `e2e/_fixtures.js` creates one
 * persistent user-data-dir per worker (inside `./test-results/e2e-profiles/`),
 * then discovers the extension ID by polling `context.serviceWorkers()`.
 *
 * Env vars (read from the environment, falling back to .env.local — optional):
 *   E2E_EMAIL / E2E_PASSWORD : Supabase email/password for login tests.
 *   PLAYWRIGHT_HEADLESS       : set to "0" to watch the run in a real window.
 *   CI                        : enables retries + retains trace/video on failure.
 */
const profileRoot = path.resolve(__dirname, "test-results", "e2e-profiles");
fs.mkdirSync(profileRoot, { recursive: true });

export default defineConfig({
  testDir: path.join(__dirname, "e2e"),
  testMatch: "**/*.e2e.js",
  fullyParallel: false,
  timeout: 120_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "about:blank",
    trace: process.env.CI ? "retain-on-failure" : "on-first-retry",
    video: process.env.CI ? "retain-on-failure" : "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium-extension",
      use: {
        ...devices["Desktop Chrome"],
        // Fixtures will create their own persistent context using these
        // values — passed through as custom use.* so they're visible there.
        // The `chromium` channel is required: the default headless build is the
        // headless shell, which never starts an MV3 service worker.
        headless: process.env.PLAYWRIGHT_HEADLESS !== "0",
        channel: "chromium",
        profileRoot,
        extensionDist: distDir,
        launchOptions: {
          slowMo: Number(process.env.PW_SLOW_MO || 0),
        },
      },
    },
  ],
});

// Keep lint happy about unused os import (reserved for future
// per-platform profile path defaults).
void os;
