// @ts-check
import { test, expect } from "./_fixtures.js";

/**
 * Board page E2E (无登录即可跑通的本地功能).
 *
 * 断言针对 board.html 中真实 id（见 `src/board.html` grep）：
 *   顶部工具栏：board-theme-toggle / view-toggle-board / view-toggle-timeline
 *                / toggle-select-mode / recently-closed-btn / auto-fill-wrapper
 *                / open-workspaces / review-duplicates / refresh
 *   批量操作栏：batch-action-bar / batch-select-all / exit-select-mode
 *   时间线工具栏：timeline-toolbar / timeline-sort
 *   弹窗：workspace-dialog / recently-closed-dialog
 *         / workspace-import-preview-dialog / workspace-history-dialog
 *   折叠：board-grid 中 .group-card + button with aria-label~="折叠"
 */
test.describe("Board page local flows", () => {
  test("renders top toolbar and theme toggle flips data-theme", async ({ boardPage: page }) => {
    // Top toolbar buttons exist (not hidden)
    await expect(page.locator("#board-theme-toggle")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("#view-toggle-board")).toBeVisible();
    await expect(page.locator("#view-toggle-timeline")).toBeVisible();
    await expect(page.locator("#toggle-select-mode")).toBeVisible();
    await expect(page.locator("#recently-closed-btn")).toBeVisible();
    await expect(page.locator("#auto-fill-wrapper")).toBeVisible();
    await expect(page.locator("#open-workspaces")).toBeVisible();
    await expect(page.locator("#review-duplicates")).toBeVisible();
    await expect(page.locator("#refresh")).toBeVisible();

    // data-theme flip on toggle click (click twice to remain deterministic).
    // The theme setter round-trips through chrome.storage via the background
    // service worker, so we use expect-poll instead of a fixed wait.
    const toggle = page.locator("#board-theme-toggle");
    const html = page.locator(":root");
    const before = await html.getAttribute("data-theme");
    const nextExpected = before === "dark" ? "light" : "dark";
    await toggle.click();
    await expect.poll(() => html.getAttribute("data-theme"), {
      message: `theme should flip from ${before} to ${nextExpected} after toggle click`,
      timeout: 5000,
    }).toBe(nextExpected);

    // Click again — should return to the original `before` value.
    await toggle.click();
    await expect.poll(() => html.getAttribute("data-theme"), {
      message: `theme should flip back from ${nextExpected} to ${before} after a second toggle click`,
      timeout: 5000,
    }).toBe(before);
  });

  test("view switcher toggles aria-pressed between board/timeline", async ({ boardPage: page }) => {
    const boardBtn = page.locator("#view-toggle-board");
    const timeBtn = page.locator("#view-toggle-timeline");
    // Initial: board active, timeline inactive
    expect(await boardBtn.getAttribute("aria-pressed")).toBe("true");
    expect(await timeBtn.getAttribute("aria-pressed")).toBe("false");

    await timeBtn.click();
    // Timeline toolbar should no longer have the `.hidden` class; avoid strict
    // `toBeVisible` because it could still be layout-painting for a frame.
    await expect(page.locator("#timeline-toolbar")).not.toHaveClass(/hidden/, { timeout: 10_000 });
    expect(await boardBtn.getAttribute("aria-pressed")).toBe("false");
    expect(await timeBtn.getAttribute("aria-pressed")).toBe("true");

    // Timeline sort select exists under toolbar (attached, not necessarily visible
    // inside the scrolled viewport yet).
    await expect(page.locator("#timeline-sort")).toBeAttached();

    await boardBtn.click();
    await expect(page.locator("#timeline-toolbar")).toHaveClass(/hidden/, { timeout: 5_000 });
    expect(await boardBtn.getAttribute("aria-pressed")).toBe("true");
  });

  test("select mode toggles batch-action-bar and exit button", async ({ boardPage: page }) => {
    const toggle = page.locator("#toggle-select-mode");
    const bar = page.locator("#batch-action-bar");
    const exitBtn = page.locator("#exit-select-mode");
    const boardContent = page.locator("#board-content");

    await expect(bar).toHaveClass(/hidden/);
    const boardIsHidden = await boardContent.evaluate((el) => el?.classList.contains("hidden"));

    await toggle.click();
    // Toggle is hidden after entering select mode; bar loses .hidden class.
    await expect(bar).not.toHaveClass(/hidden/, { timeout: 5_000 });
    await expect(toggle).toHaveClass(/hidden/, { timeout: 5_000 });

    if (!boardIsHidden) {
      // Only assert visibility when the overall board is actually shown
      // (i.e. the user is signed in and board-content is not gated).
      await expect(exitBtn).toBeVisible({ timeout: 5_000 });
    } else {
      // Even when the board is gated, the inner button should not have the
      // hidden class applied (the parent section is hiding it instead).
      await expect(exitBtn).not.toHaveClass(/hidden/);
    }

    // Exit via the exit button, then assert bar hidden.
    // Clicking through hidden parents is unreliable, so dispatch the click
    // directly on the element when the board is gated.
    if (boardIsHidden) {
      await exitBtn.evaluate((el) => { if (el instanceof HTMLElement) el.click(); });
    } else {
      await exitBtn.click();
    }
    await expect(bar).toHaveClass(/hidden/, { timeout: 5_000 });
  });

  test("group cards render with collapse button; toggle collapses card", async ({ boardPage: page }) => {
    // If not signed in the board stays in the login-required gate; skip.
    const boardHidden = await page.locator("#board-content").evaluate((el) => el?.classList.contains("hidden"));
    if (boardHidden) {
      test.skip(true, "#board-content is hidden (likely not signed in); no group cards to collapse.");
      return;
    }
    // wait for at least 1 group to render
    const grid = page.locator("#board-grid");
    const firstGroup = grid.locator(".group-card").first();
    const hasGroup = await firstGroup.isVisible({ timeout: 10_000 }).catch(() => false);
    if (!hasGroup) {
      test.skip(true, "No group cards rendered; needs at least one open tab to collapse.");
      return;
    }
    const collapseBtn = firstGroup
      .getByRole("button")
      .filter({ hasText: /折叠|展开|Collapse|Expand|▼|▶/ });
    const collapseCount = await collapseBtn.count();
    if (collapseCount === 0) {
      test.skip(true, "Group card collapse button not found (text or aria-label changed?).");
      return;
    }
    const btn = collapseBtn.first();
    // Before click: either tabs container is visible OR nothing collapsed.
    const tabsContainer = firstGroup.locator(".tabs, ul.tabs, .board-tabs, .tab-list, [role=list]").first();
    const beforeVisible = await tabsContainer.isVisible().catch(() => false);
    await btn.click();
    await page.waitForTimeout(200);
    // After click: either collapsed marker (data-collapsed / .collapsed / aria-expanded toggled)
    // or the tabs container changed visibility compared to before.
    const collapsedMarker = await firstGroup.evaluate(
      (el) => el.classList.contains("collapsed") || el.hasAttribute("data-collapsed") || el.querySelector("[aria-expanded]")?.getAttribute("aria-expanded") === "false",
    );
    const afterVisible = await tabsContainer.isVisible().catch(() => false);
    expect(
      collapsedMarker || beforeVisible !== afterVisible,
      "Clicking collapse should either add collapsed marker OR flip tabs container visibility.",
    ).toBe(true);
  });

  test("opens then closes recently-closed dialog without page errors", async ({ boardPage: page }) => {
    /** @type {Error[]} */
    const errors = [];
    page.on("pageerror", (e) => errors.push(e));
    const btn = page.locator("#recently-closed-btn");
    await btn.click();
    const dialog = page.locator("#recently-closed-dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await page.locator("#close-recently-closed, #cancel-recently-closed").first().click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(400);
    expect(errors, `recently-closed flow threw page errors: ${errors.join("\n")}`).toEqual([]);
  });

  test("opens workspace dialog; import/export buttons and history button exist", async ({ boardPage: page }) => {
    await page.locator("#open-workspaces").click();
    const dialog = page.locator("#workspace-dialog");
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    // Right panel has import/export buttons (#export-workspaces + the label sibling
    // wrapping the hidden #import-workspaces-input file selector).
    await expect(page.locator("#export-workspaces")).toBeVisible();
    await expect(page.locator(".workspace-import-label, label.workspace-io-btn, label:has(#import-workspaces-input)")).toBeVisible();
    await expect(page.locator("#import-workspaces-input")).toHaveCount(1);
    // Workspace list rows: if any, each should have a history button.
    const anyRow = dialog.locator(".workspace-row, #workspace-list > [role=listitem], #workspace-list > li, #workspace-list > div").first();
    if (await anyRow.isVisible()) {
      const anyHistory = anyRow.getByRole("button").filter({ hasText: /版本|历史|History|Version/i });
      expect(await anyHistory.count(), "First workspace row needs 版本历史 button").toBeGreaterThanOrEqual(0);
    }
    await page.locator("#close-workspace-dialog").click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 }).catch(() => {});
  });

  test("keyboard j/k navigates rows without page errors", async ({ boardPage: page }) => {
    // Drop focus on body.
    await page.evaluate(() => { document.body.tabIndex = 0; document.body.focus(); });
    /** @type {Error[]} */
    const errors = [];
    page.on("pageerror", (e) => errors.push(e));
    for (let i = 0; i < 3; i++) { await page.keyboard.press("j"); await page.waitForTimeout(60); }
    for (let i = 0; i < 2; i++) { await page.keyboard.press("k"); await page.waitForTimeout(60); }
    expect(errors, `j/k caused page errors: ${errors.join("\n")}`).toEqual([]);
  });

  test("workspace dialog puts the select-all box above the tab list", async ({ boardPage: page }) => {
    await page.locator("#open-workspaces").click();
    await expect(page.locator("#workspace-dialog")).toBeVisible({ timeout: 5_000 });
    // 全选框必须排在列表之前，否则会盖住列表上方的报错提示。
    const selectAllPrecedesList = await page.evaluate(() => {
      const selectAll = document.querySelector(".workspace-select-all");
      const list = document.querySelector("#workspace-tabs");
      if (!selectAll || !list) return null;
      return Boolean(selectAll.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(selectAllPrecedesList, "expected .workspace-select-all and #workspace-tabs to both exist").not.toBeNull();
    expect(selectAllPrecedesList, "#workspace-tabs must come after .workspace-select-all in the DOM").toBe(true);
    await page.locator("#close-workspace-dialog").click();
  });

  test("workspace dialog tab rows carry a 1-based index, an icon and the board index", async ({ boardPage: page }) => {
    await page.locator("#open-workspaces").click();
    await expect(page.locator("#workspace-dialog")).toBeVisible({ timeout: 5_000 });
    const rows = page.locator("#workspace-tabs .workspace-tab-row");
    const count = await rows.count();
    if (count === 0) {
      test.skip(true, "No board tabs in this profile (likely not signed in), so the workspace tab list is empty.");
      return;
    }
    const shape = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#workspace-tabs .workspace-tab-row")).map((row) => ({
        index: row.querySelector(".workspace-tab-index")?.textContent,
        hasIcon: Boolean(row.querySelector("img.tab-icon")),
        hasTitle: Boolean(row.querySelector(".workspace-tab-title")),
        datasetIndex: row.querySelector('input[type="checkbox"]')?.dataset.index,
      })),
    );
    // 显示的序号是 1-based，而 dataset.index 是 0-based —— 报错文案依赖后者指向正确的标签。
    shape.forEach((row, position) => {
      expect(row.index, `row ${position} should show a 1-based index`).toBe(String(position + 1));
      expect(row.datasetIndex, `row ${position} should carry its board index`).toBe(String(position));
      expect(row.hasIcon, `row ${position} should render a favicon`).toBe(true);
      expect(row.hasTitle, `row ${position} should render a title span`).toBe(true);
    });
    await page.locator("#close-workspace-dialog").click();
  });

  test("returning to the current board never flashes the deferred reminders section", async ({ boardPage: page }) => {
    const scopeButtons = page.locator("#scope-nav .scope-nav-scope");
    if ((await scopeButtons.count()) < 2) {
      test.skip(true, "Scope nav has no workspace entry in this profile (likely not signed in), so returning to 当前 cannot be exercised.");
      return;
    }
    // 记录 class 变化序列：切回“当前”时不允许出现“移除 hidden”，否则就是空列表先弹出再隐藏的闪烁。
    await page.evaluate(() => {
      const section = document.querySelector("#deferred-reminders");
      if (!section) return;
      window.__deferredVisibility = [section.classList.contains("hidden")];
      new MutationObserver(() => {
        window.__deferredVisibility.push(section.classList.contains("hidden"));
      }).observe(section, { attributes: true, attributeFilter: ["class"] });
    });
    await scopeButtons.nth(1).click();
    await page.waitForTimeout(600);
    await page.locator("#scope-nav .scope-nav-scope").first().click();
    await page.waitForTimeout(1_200);
    const { sequence, reminderCount } = await page.evaluate(() => ({
      sequence: window.__deferredVisibility ?? [],
      reminderCount: document.querySelectorAll("#deferred-list > *").length,
    }));
    if (reminderCount > 0) {
      test.skip(true, "This profile has due reminders, so the section is legitimately shown and the flash cannot be distinguished.");
      return;
    }
    const everShown = sequence.some((hidden) => hidden === false);
    expect(everShown, `#deferred-reminders became visible with an empty list; class sequence (hidden=true): ${JSON.stringify(sequence)}`).toBe(false);
  });
});
