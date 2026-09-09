// @ts-check
/**
 * Playwright fixtures for Tab Garden extension E2E tests.
 *
 * Key insight: the default Playwright `context` (non-persistent) does NOT
 * start extension service workers reliably when you just pass
 * `--load-extension=`. To guarantee the MV3
 * service worker boots we instead build the browser context ourselves via
 * `chromium.launchPersistentContext` using a throwaway profile directory
 * inside `./test-results/e2e-profiles/`.
 *
 * Fixtures exposed:
 *   - `extContext` : BrowserContext  — one per test, profile wiped per run
 *   - `extensionId`: string          — dynamically discovered from SW URL
 *   - `popupPage`   : Page           — extension popup loaded
 *   - `boardPage`   : Page           — extension board.html loaded
 *   - `optionsPage` : Page           — extension options.html loaded
 */
import { test as base, expect, chromium } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

/** @typedef {import('@playwright/test').BrowserContext} BrowserContext */

/**
 * Poll until the Tab Garden MV3 service worker is registered in the
 * context; return its extension id (32-char lowercase a-p).
 *
 * Also scans all open pages in case the board was opened before the SW
 * started.
 *
 * @param {BrowserContext} context
 * @returns {Promise<string>}
 */
export async function findExtensionId(context) {
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    for (const w of context.serviceWorkers()) {
      const m = w.url().match(/^chrome-extension:\/\/([a-p]{32})\//);
      if (m) return m[1];
    }
    for (const p of context.pages()) {
      const m = p.url().match(/^chrome-extension:\/\/([a-p]{32})\//);
      if (m) return m[1];
    }
    // Nudge: open a blank page; sometimes this is enough to wake the SW.
    if (context.pages().length === 0) {
      try {
        await context.newPage();
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(
    "Timed out trying to find the Tab Garden extension ID. " +
      "Make sure `npm run build` succeeded so dist/ contains the compiled " +
      "extension and that the current config loads it via launchPersistentContext.",
  );
}

/**
 * Create a new page pointing at the given extension resource.
 *
 * @param {BrowserContext} context
 * @param {string} extensionId
 * @param {"board.html" | "popup.html" | "options.html"} resource
 */
async function openExtensionPage(context, extensionId, resource) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${resource}`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  return page;
}

export const openBoardPage = (/** @type {BrowserContext} */ c, /** @type {string} */ id) =>
  openExtensionPage(c, id, "board.html");
export const openPopupPage = (c, id) => openExtensionPage(c, id, "popup.html");
export const openOptionsPage = (c, id) => openExtensionPage(c, id, "options.html");

/**
 * Waits for the board page to settle — either `#board-content` is visible or
 * the login banner is shown (no session yet). Either state means the page is
 * ready for the tests to proceed.
 */
export async function waitForBoardReady(/** @type {import('@playwright/test').Page} */ page) {
  await Promise.race([
    page.waitForSelector("#board-content:not(.hidden)", { timeout: 30_000 }),
    page.waitForSelector("#login-required:not([hidden])", { timeout: 30_000 }),
    page.waitForSelector("#app-shell, main.board-app", { timeout: 30_000, state: "attached" }),
  ]).catch(() => {});
}

export function getCredentials() {
  return {
    email: process.env.E2E_EMAIL,
    password: process.env.E2E_PASSWORD,
  };
}

/**
 * Fixture overrides: we replace the default `context`/`browser` with a
 * persistent context that enables extension loading. The worker-scoped
 * profile is created once per worker.
 */
export const test = base.extend({
  // worker-scoped: create one profile dir per playwright worker process
  // (we have workers=1 so this is effectively a single throwaway dir).
  profileDir: [
    async ({}, use, workerInfo) => {
      const { profileRoot } = /** @type {*} */ (workerInfo.project.use);
      const dir = path.join(profileRoot, `worker-${workerInfo.workerIndex}-${Date.now()}`);
      fs.mkdirSync(dir, { recursive: true });
      await use(dir);
      // Best-effort cleanup after the whole worker finishes.
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    },
    { scope: "worker" },
  ],

  // Browser (shared across tests, chromium-only).
  browser: [
    async ({}, use) => {
      // We bypass the default browser fixture entirely; launchPersistentContext
      // creates the browser itself. This ensures `--load-extension` is honoured
      // for MV3 in both headed and headless Chromium.
      const noop = /** @type {*} */ (null);
      await use(noop);
    },
    { scope: "worker" },
  ],

  // Worker-scoped persistent context: lives for the whole test run, one dir.
  extContext: [
    async ({ profileDir }, use, workerInfo) => {
      const useOpts = /** @type {*} */ (workerInfo.project.use);
      const { extensionDist, headless, launchOptions = {} } = useOpts;
      // Headless only starts extension service workers on the full Chromium
      // build, so playwright.config.js pairs it with `channel: "chromium"`.
      const effectiveHeadless = headless === true ? true : false;
      const context = await chromium.launchPersistentContext(profileDir, {
        headless: effectiveHeadless,
        channel: useOpts.channel || undefined,
        args: [
          `--disable-extensions-except=${extensionDist}`,
          `--load-extension=${extensionDist}`,
          "--disable-infobars",
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-blink-features=AutomationControlled",
          "--window-size=1280,900",
        ],
        viewport: { width: 1280, height: 900 },
        locale: "zh-CN",
        acceptDownloads: true,
        ...launchOptions,
      });
      await use(context);
      try { await context.close(); } catch {}
    },
    { scope: "worker", auto: true },
  ],

  // Test-scoped context alias so existing tests can still destructure `context`.
  context: [
    async ({ extContext }, use) => {
      // Close any leftover tabs (except about:blank) between tests, so each
      // test starts with a clean session.
      for (const p of extContext.pages()) {
        try { if (!/about:blank/.test(p.url())) await p.close(); } catch {}
      }
      await use(extContext);
    },
    { scope: "test" },
  ],

  extensionId: [
    async ({ extContext }, use) => {
      const id = await findExtensionId(extContext);
      await use(id);
    },
    { scope: "test" },
  ],

  boardPage: [
    async ({ extContext, extensionId }, use) => {
      const page = await openBoardPage(extContext, extensionId);
      await waitForBoardReady(page);
      await use(page);
      await page.close().catch(() => {});
    },
    { scope: "test" },
  ],

  popupPage: [
    async ({ extContext, extensionId }, use) => {
      const page = await openPopupPage(extContext, extensionId);
      await page.waitForLoadState("domcontentloaded");
      await use(page);
      await page.close().catch(() => {});
    },
    { scope: "test" },
  ],

  optionsPage: [
    async ({ extContext, extensionId }, use) => {
      const page = await openOptionsPage(extContext, extensionId);
      await page.waitForLoadState("domcontentloaded");
      await use(page);
      await page.close().catch(() => {});
    },
    { scope: "test" },
  ],
});

export { expect };
