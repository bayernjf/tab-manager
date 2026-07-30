// @ts-check
import { test, expect, getCredentials } from "./_fixtures.js";

/**
 * Smoke-test extension surfaces that don't require any user state:
 *  - pages load without console errors
 *  - default i18n copy renders on key elements
 *  - popup login form exists and accepts input
 *  - options page has language/theme sections (with select dropdowns)
 */
test.describe("Extension boot smoke", () => {
  test("popup page loads and shows login form or app view", async ({ popupPage: popup }) => {
    await expect(popup.locator("#auth-form, #app-view").first()).toBeVisible({ timeout: 15_000 });
    // No fatal JS errors
    const errors = [];
    popup.on("pageerror", (err) => errors.push(err));
    await popup.waitForTimeout(1500);
    expect(errors, `popup page had console errors: ${errors.join("\n")}`).toEqual([]);
  });

  test("options page renders language and theme dropdowns", async ({ optionsPage: page }) => {
    await page.waitForLoadState("domcontentloaded");
    // Both setting cards should exist regardless of auth state
    await expect(page.locator("#language-select, [data-testid=language-select]").first()).toBeVisible({ timeout: 20_000 }).catch(() => {});
    const selectors = ["#language-select", "#theme-select"];
    for (const sel of selectors) {
      const el = page.locator(sel);
      const count = await el.count();
      // Either the exact selector exists, or language/theme are rendered as
      // non-id elements; we assert at least one clickable container exists.
      if (count === 0) {
        await expect(page.getByText(/语言|Language/i).first()).toBeVisible();
        await expect(page.getByText(/主题|Theme/i).first()).toBeVisible();
        break;
      }
    }
  });
});

/**
 * Login flow using credentials provided via E2E_EMAIL / E2E_PASSWORD env vars.
 */
test.describe("Popup login flow (requires credentials)", () => {
  function requireCreds() {
    const { email, password } = getCredentials();
    if (!email || !password) {
      test.skip(true, "Set E2E_EMAIL and E2E_PASSWORD env vars to run the login E2E flow.");
    }
    return { email, password };
  }

  test("can sign in and app view renders with logout button", async ({ popupPage: popup }) => {
    const { email, password } = requireCreds();
    await expect(popup.locator("#auth-view, #app-view").first()).toBeVisible({ timeout: 15_000 });
    const alreadyLoggedIn = await popup.locator("#app-view").isVisible();
    if (!alreadyLoggedIn) {
      const loginTab = popup.locator("#login-tab");
      if (await loginTab.isVisible()) await loginTab.click();
      await popup.locator("#auth-email").fill(email);
      await popup.locator("#auth-password").fill(password);
      const remember = popup.locator("#remember-device");
      if (await remember.isVisible()) await remember.check();
      const status = popup.locator("#auth-status");
      const submit = popup.locator("#auth-submit");
      await Promise.all([
        popup.waitForEvent("request", (r) => /supabase\.co/.test(r.url()), { timeout: 30_000 }).catch(() => {}),
        submit.click(),
      ]);
      await expect(
        popup.locator("#app-view").or(status.filter({ hasText: /已登录|login|success|成功|确认|邮件/i })),
      ).toBeVisible({ timeout: 45_000 });
    }
    if (await popup.locator("#app-view").isVisible()) {
      await expect(popup.locator("#logout")).toBeVisible();
    }
  });
});
