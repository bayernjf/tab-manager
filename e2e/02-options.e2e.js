// @ts-check
import { test, expect } from "./_fixtures.js";

/**
 * Options page E2E.
 *
 * Important: most sidebar nav buttons are disabled when the user is not
 * logged in (see options.ts setAuthenticatedUi). These tests therefore:
 *   - when not authenticated: assert only "account" panel is active, the
 *     login banner is shown, and html-level ids (theme-select / language-select
 *     already rendered in the DOM but hidden panels) still exist.
 *   - when authenticated (after login test above): navigate to the appearance
 *     panel and verify theme + language controls visible.
 */
test.describe("Options page navigation", () => {
  test("sidebar: account panel active by default, others disabled when not signed in", async ({ optionsPage: page }) => {
    const navButtons = page.locator(".nav-link");
    const total = await navButtons.count();
    expect(total, "expected at least 5 sidebar nav links").toBeGreaterThanOrEqual(5);
    // Account link is active and enabled
    const accountBtn = page.locator('.nav-link[data-panel="account"]');
    await expect(accountBtn).toBeEnabled();
    await expect(accountBtn).toHaveClass(/active/);
    // Account panel is visible (not hidden).
    await expect(page.locator("#account.panel")).not.toHaveAttribute("hidden", /.*/, { timeout: 5_000 });
  });

  test("theme and language selects exist in DOM (regardless of authentication)", async ({ optionsPage: page }) => {
    // theme-select and language-select are static HTML inside #appearance which
    // can be hidden when not signed in; they should still be attached.
    await expect(page.locator("#theme-select")).toBeAttached();
    await expect(page.locator("#language-select")).toBeAttached();
    // #theme-select has at least the light/dark <option> children.
    const opts = page.locator("#theme-select option");
    expect(await opts.count(), "theme-select options").toBeGreaterThanOrEqual(2);
    // #language-select has 跟随浏览器 + 中文 + English.
    const langOpts = page.locator("#language-select option");
    expect(await langOpts.count(), "language-select options").toBeGreaterThanOrEqual(3);
  });

  test("#shortcut-times hash opens the preferences panel and reveals the shortcut card (once signed in)", async ({ extContext, extensionId, popupPage }) => {
    // In this profile, if the previous login e2e test authenticated we'll
    // have a session already. Otherwise, bail out with skip since the hash
    // jump requires a non-disabled preferences nav button.
    const opts = await extContext.newPage();
    await opts.goto(`chrome-extension://${extensionId}/options.html`, { waitUntil: "domcontentloaded" });
    const preferencesBtn = opts.locator('.nav-link[data-panel="preferences"]');
    const enabled = await preferencesBtn.isEnabled();
    if (!enabled) {
      test.skip(true, "Not authenticated in this profile; preferences nav button disabled so hash jump is intentionally a no-op.");
      await opts.close();
      return;
    }
    // Reload with hash now that we're authenticated.
    await opts.close();
    const opts2 = await extContext.newPage();
    await opts2.goto(`chrome-extension://${extensionId}/options.html#shortcut-times`, { waitUntil: "domcontentloaded" });
    await expect(opts2.locator("#preferences.panel")).not.toHaveAttribute("hidden", /.*/, { timeout: 10_000 });
    // Active panel matches preferences nav.
    await expect(opts2.locator('.nav-link[data-panel="preferences"]')).toHaveClass(/active/);
    // The hash exists to draw the eye to this one card, not just open the panel.
    // The highlight is removed after 1.6s, so assert it right after the panel opens.
    await expect(opts2.locator("#shortcut-times-card")).toHaveClass(/highlight/, { timeout: 3_000 });
    await opts2.close();
  });

  test("appearance panel can be switched to (once signed in) and renders controls", async ({ optionsPage: page }) => {
    const appearanceBtn = page.locator('.nav-link[data-panel="appearance"]');
    if (!(await appearanceBtn.isEnabled())) {
      test.skip(true, "Not authenticated; appearance nav button is disabled intentionally.");
      return;
    }
    await appearanceBtn.click();
    await expect(page.locator("#appearance.panel")).not.toHaveAttribute("hidden", /.*/, { timeout: 8_000 });
    // theme-select + language-select are *visible* (not just attached) now.
    await expect(page.locator("#theme-select")).toBeVisible();
    await expect(page.locator("#language-select")).toBeVisible();
    await expect(page.locator("#default-color")).toBeVisible();
  });
});
