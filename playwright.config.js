// @ts-check
import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "dist");

/**
 * Playwright config for Tab Garden Chrome extension E2E tests.
 *
 * To make MV3 extensions load reliably we use `launchPersistentContext`,
 * which requires headed mode (headless: false) on Chromium because the
 * legacy headless backend does not start extension service workers.
 * The new `headless=new` backend would work, but `launchPersistentContext`
 * only accepts the boolean variant, so we default to headed mode here.
 * A worker-scoped fixture in `e2e/_fixtures.js` creates one persistent
 * user-data-dir per worker (inside `./test-results/e2e-profiles/`),
 * then discovers the extension ID by polling `context.serviceWorkers()`.
 *
 * Env vars (optional):
 *   E2E_EMAIL / E2E_PASSWORD : Supabase email/password for login tests.
 *   PLAYWRIGHT_HEADLESS       : set to "1" to force headless (won't load MV3 SWs).
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
        // NOTE: `launchPersistentContext` only accepts boolean headless, and
        // the legacy headless=true backend cannot load MV3 service workers.
        // Therefore default to headed (false) here. Override with
        // PLAYWRIGHT_HEADLESS=1 only if you know your Chromium supports it.
        headless: process.env.PLAYWRIGHT_HEADLESS === "1" ? true : false,
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
