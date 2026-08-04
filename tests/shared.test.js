import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

globalThis.chrome = {};
const {
  automaticBoardKey,
  boardDropIndex,
  boardCustomGroupFromSyncRow,
  boardLayoutFromSyncRow,
  buildBoardCards,
  heightUnitsForTabCount,
  applyPortableImport,
  canConfirmOptionsImport,
  customBoardKey,
  findMatchingRule,
  groupRuleFromSyncRow,
  getSiteKey,
  ignoredSiteFromSyncRow,
  isBrowserNewTabUrl,
  isIgnoredSite,
  matchesDomain,
  normalizeDomainInput,
  normalizeHostname,
  parsePortableData,
  previewPortableImport,
  resolveAutoGroup,
  resetOptionsForUser,
  resolveCloudCollection,
  syncFailureStatus,
  siteTitle,
  segmentTabs,
  placeBoardCards,
  boardCardsForDevice,
  boardTabMatchesQuery,
  boardWindowLabel,
  findDuplicateBoardTabs,
  validateWorkspaceTitle,
  validateWorkspaceTab,
  validateWorkspaceSnapshot,
  validateDeferredTab,
  isDeferredTabDue,
  formatShortcutKeys,
  isMacPlatform,
  SHORTCUT_COMMANDS,
  normalizeDeferredShortcutTimes,
  manualBoardGridRow,
  moveManualBoardCard,
  moveBoardGroupRank,
  validateBoardTabDrop,
  validateBoardLayout,
  validateOptionsSettings,
  settingsFromSyncRow,
  toPortableData,
  toPortableDataFromState,
  updateGroupRuleFromInput,
  buildVirtualBoardGroups,
  moveVirtualBoardAssignment,
  detectBrowserKind,
  groupWorkspaceTabsByDomain,
  moveWorkspaceTab,
  updateWorkspaceTab,
  removeWorkspaceTab,
  appendWorkspaceTab,
  DEFAULT_SETTINGS,
} = await import("../dist/shared.js");
const { getCurrentUser, getStoredUser, isExplicitAuthenticationFailure, isRememberedSessionValid } = await import("../dist/auth.js");
const { settingsSyncRow } = await import("../dist/sync.js");

function cssBlocks(css) {
  const blocks = [];
  let cursor = 0;

  while (cursor < css.length) {
    const openBrace = css.indexOf("{", cursor);
    if (openBrace < 0) break;

    let braceDepth = 0;
    let closeBrace = -1;
    for (let index = openBrace; index < css.length; index += 1) {
      if (css[index] === "{") braceDepth += 1;
      if (css[index] === "}") braceDepth -= 1;
      if (braceDepth === 0) {
        closeBrace = index;
        break;
      }
    }
    if (closeBrace < 0) break;

    blocks.push({
      selector: css.slice(cursor, openBrace).trim(),
      body: css.slice(openBrace + 1, closeBrace),
    });
    cursor = closeBrace + 1;
  }

  return blocks;
}

function normalizedCssSelector(selector) {
  return selector.trim().replace(/\s+/g, " ");
}

function cssRule(css, selector) {
  const normalizedSelector = normalizedCssSelector(selector);
  return cssBlocks(css).find((block) => !block.selector.startsWith("@") && normalizedCssSelector(block.selector) === normalizedSelector)?.body ?? "";
}

function cssMediaBlock(css, mediaQuery) {
  const mediaPattern = new RegExp(`^@media\\s*\\(\\s*${mediaQuery}\\s*\\)$`);
  return cssBlocks(css).find((block) => mediaPattern.test(block.selector))?.body ?? "";
}

test("keeps authentication screens hidden until cached session lookup resolves", async () => {
  const popupHtml = await readFile(new URL("../dist/popup.html", import.meta.url), "utf8");

  assert.match(popupHtml, /<main id="boot-view" class="boot-view"[^>]*>/);
  assert.match(popupHtml, /<main id="auth-view" class="auth-view hidden">/);
  assert.match(popupHtml, /<main id="app-view" class="hidden">/);
});

test("renders a seven-day device remember checkbox for sign-in", async () => {
  const [popupHtml, popupScript] = await Promise.all([
    readFile(new URL("../dist/popup.html", import.meta.url), "utf8"),
    readFile(new URL("../dist/popup.js", import.meta.url), "utf8"),
  ]);

  assert.match(popupHtml, /<input id="remember-device" type="checkbox">/);
  assert.match(popupHtml, /在此设备记住7天/);
  assert.match(popupScript, /rememberForSevenDays: rememberDevice\.checked/);
});

test("invalidates remembered sessions at the seven-day deadline", () => {
  const now = 1_700_000_000;

  assert.equal(isRememberedSessionValid(now + 1, now), true);
  assert.equal(isRememberedSessionValid(now, now), false);
  assert.equal(isRememberedSessionValid(undefined, now), true);
});

test("includes the new-tab board setting in the built options page", async () => {
  const optionsHtml = await readFile(new URL("../dist/options.html", import.meta.url), "utf8");

  assert.match(optionsHtml, /<input id="new-tab-board" type="checkbox" aria-describedby="new-tab-board-description">/);
  assert.match(optionsHtml, /data-i18n="openBoardOnNewTab"/);
  assert.match(optionsHtml, /<p id="new-tab-board-description" class="muted" data-i18n="openBoardOnNewTabHint">/);
});

test("opens the board in the popup's current window", async () => {
  const popupScript = await readFile(new URL("../dist/popup.js", import.meta.url), "utf8");

  assert.match(popupScript, /chrome\.tabs\.query\(\{ active: true, currentWindow: true \}\)/);
  assert.match(popupScript, /type: "open-tab-board", windowId/);
});

test("builds board tab activation and close message handlers", async () => {
  const background = await readFile(new URL("../dist/background.js", import.meta.url), "utf8");

  assert.match(background, /message\.type === "activate-board-tab"/);
  assert.match(background, /chrome\.windows\.update\(tab\.windowId, \{ focused: true \}\)/);
  assert.match(background, /chrome\.tabs\.update\(tabId, \{ active: true \}\)/);
  assert.match(background, /message\.type === "close-board-tab"/);
  assert.match(background, /chrome\.tabs\.remove\(message\.tabId\)/);
});

test("renders board tab open and close controls with focus-revealed close styling", async () => {
  const [boardScript, boardCss] = await Promise.all([
    readFile(new URL("../dist/board.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/board.css", import.meta.url), "utf8"),
  ]);

  assert.match(boardScript, /className = "tab-open"/);
  assert.match(boardScript, /"tab-close"/);
  assert.match(boardScript, /type: "activate-board-tab", tabId/);
  assert.match(boardScript, /type: "close-board-tab", tabId/);
  assert.match(boardCss, /\.tab-row:hover \.tab-close/);
  assert.match(boardCss, /\.tab-row:focus-within \.tab-close/);
});

test("uses the page scroll instead of an inner scroll for board tab lists", async () => {
  const boardCss = await readFile(new URL("../dist/board.css", import.meta.url), "utf8");

  assert.match(boardCss, /\.tabs \{ overflow: visible; max-height: none; \}/);
  assert.match(boardCss, /\.board-grid \{[^}]*overflow: visible;/);
});

test("styles the board as the header's primary action", async () => {
  const [popupHtml, popupCss] = await Promise.all([
    readFile(new URL("../dist/popup.html", import.meta.url), "utf8"),
    readFile(new URL("../dist/popup.css", import.meta.url), "utf8"),
  ]);

  assert.match(popupHtml, /id="open-board" class="header-action board-action"/);
  assert.match(popupHtml, /id="logout" class="header-action logout-action"/);
  assert.match(popupCss, /\.board-action \{[^}]*background: var\(--brand-bg\)/);
  assert.match(popupCss, /\.logout-action \{[^}]*border: 1px solid var\(--border-logout\)/);
});

test("positions board tab close controls on the right", async () => {
  const boardCss = await readFile(new URL("../dist/board.css", import.meta.url), "utf8");

  assert.match(boardCss, /\.tab-close \{[^}]*right: 8px/);
  assert.doesNotMatch(boardCss, /\.tab-close \{[^}]*left: 10px/);
  assert.match(boardCss, /\.tab-open \{[^}]*padding: 3px 4px/);
  assert.match(boardCss, /\.tab-row:hover \.tab-open[^}]*padding-right: 104px/);
  assert.match(boardCss, /\.tab-defer \{[^}]*color: var\(--text-warning\)/);
  assert.match(boardCss, /\.tab-saveworkspace \{[^}]*right: 68px/);
});

test("shows close-tab feedback as a fixed toast centered on the group heading", async () => {
  const [script, css] = await Promise.all([
    readFile(new URL("../dist/board.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/board.css", import.meta.url), "utf8"),
  ]);
  const closeFn = script.slice(script.indexOf("async function closeTab"), script.indexOf("function applyOptimisticGroupReorder"));

  assert.match(closeFn, /boardToast\(i18n\.t\("tabClosed"\), false, anchor\)/);
  assert.match(closeFn, /boardToast\(error instanceof Error \? error\.message : String\(error\), true, anchor\)/);
  assert.doesNotMatch(closeFn, /showStatus\("标签已关闭"\)/);
  assert.match(script, /row\.closest\("\.group-card"\)/);
  assert.match(script, /card\?\.querySelector\("\.card-title"\)/);
  assert.match(script, /heading \?\? close/);
  assert.match(script, /function boardToast/);
  assert.match(script, /anchor\.classList\.contains\("card-title"\) \|\| anchor\.closest\("\.card-title"\)/);
  assert.match(script, /isCardHeading/);
  assert.match(script, /rect\.left \+ rect\.width \/ 2 - toastWidth \/ 2/);
  assert.match(script, /document\.body\.append\(toast\)/);
  assert.match(script, /setTimeout\(\(\) => \{ toast\.remove\(\); \}, 2200\)/);
  assert.match(css, /\.board-toast \{[^}]*position: fixed/);
  assert.match(css, /\.board-toast\.success/);
  assert.match(css, /\.board-toast\.error/);
});

test("shows workspace tab deletion feedback as a toast centered on the group heading", async () => {
  const script = await readFile(new URL("../dist/board.js", import.meta.url), "utf8");
  const deleteFn = script.slice(script.indexOf("async function deleteWorkspaceTab"), script.indexOf("async function addWorkspaceTab"));

  assert.match(deleteFn, /boardToast\(i18n\.t\("tabRemovedFromWorkspace"\)/);
  assert.match(deleteFn, /boardToast\(error instanceof Error \? error\.message : String\(error\), true/);
  assert.doesNotMatch(deleteFn, /showStatus\("标签已从工作区删除"\)/);
  assert.match(script, /void deleteWorkspaceTab\(flatIndex, heading \?\? close\)/);
});

test("confirms last-tab deletion also removes the workspace", async () => {
  const [script, html] = await Promise.all([
    readFile(new URL("../dist/board.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/board.html", import.meta.url), "utf8"),
  ]);
  const deleteFn = script.slice(script.indexOf("async function deleteWorkspaceTab"), script.indexOf("async function addWorkspaceTab"));

  assert.match(deleteFn, /workspaceCards\.length === 1 && totalTabs === 1/);
  assert.match(deleteFn, /lastTabConfirmDialog\.showModal/);
  assert.match(deleteFn, /confirmLastTabConfirm\.disabled = false/);
  assert.match(deleteFn, /cancelLastTabConfirm\.disabled = false/);
  assert.match(deleteFn, /await send\(\{ type: "delete-workspace", id: workspaceId \}\)/);
  assert.match(deleteFn, /boardToast\(i18n\.t\("workspaceDeleted"\)/);
  assert.match(deleteFn, /loadedWorkspace = null/);
  assert.match(deleteFn, /lastTabConfirmDialog\.close/);
  assert.match(deleteFn, /const cleanup = \(\) =>/);
  assert.match(html, /last-tab-confirm-dialog/);
  assert.match(html, /data-i18n="workspaceWillBeDeleted"/);
});

test("gives GitHub's white favicon a contrasting background", async () => {
  const [boardScript, boardCss] = await Promise.all([
    readFile(new URL("../dist/board.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/board.css", import.meta.url), "utf8"),
  ]);

  assert.match(boardScript, /getSiteKey\(tab\.url\) === "github\.com"/);
  assert.match(boardScript, /github-tab-icon/);
  assert.match(boardCss, /\.github-tab-icon \{[^}]*background: var\(--github-icon-bg\)/);
  assert.match(boardCss, /--github-icon-bg: #24292f/);
});

test("identifies only Chrome's exact browser new-tab URL", () => {
  assert.equal(isBrowserNewTabUrl("chrome://newtab/"), true);
  assert.equal(isBrowserNewTabUrl("edge://newtab/"), true);
  assert.equal(isBrowserNewTabUrl(undefined), false);
  assert.equal(isBrowserNewTabUrl("chrome-extension://extension-id/board.html"), false);
  assert.equal(isBrowserNewTabUrl("https://example.com/"), false);
  assert.equal(isBrowserNewTabUrl("http://example.com/"), false);
  assert.equal(isBrowserNewTabUrl("chrome://new-tab-page/"), false);
  assert.equal(isBrowserNewTabUrl("chrome://newtab"), false);
  assert.equal(isBrowserNewTabUrl("edge://newtab"), false);
});

test("matches board-tab search queries against title, URL, and hostname", () => {
  const tab = { id: 1, windowId: 7, title: "GitHub pull request", url: "https://github.com/openai/tab-garden/pulls/1" };

  assert.equal(boardTabMatchesQuery(tab, "github"), true);
  assert.equal(boardTabMatchesQuery(tab, "openai/tab-garden"), true);
  assert.equal(boardTabMatchesQuery(tab, "calendar"), false);
  assert.equal(boardTabMatchesQuery(tab, ""), true);
});

test("creates readable runtime-only window labels", () => {
  assert.equal(boardWindowLabel(1), "窗口 1");
  assert.equal(boardWindowLabel(0), null);
  assert.equal(boardWindowLabel(1.5), null);
});

test("renders board search and source-window filter controls", async () => {
  const [boardHtml, boardScript, boardCss] = await Promise.all([
    readFile(new URL("../dist/board.html", import.meta.url), "utf8"),
    readFile(new URL("../dist/board.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/board.css", import.meta.url), "utf8"),
  ]);

  assert.match(boardHtml, /id="board-search"/);
  assert.match(boardHtml, /id="window-filter"/);
  assert.match(boardScript, /boardTabMatchesQuery/);
  assert.match(boardScript, /renderWindowFilter/);
  assert.match(boardCss, /\.toolbar-filters/);
});

test("groups only duplicate normalized HTTP(S) URLs and retains the first tab", () => {
  const groups = findDuplicateBoardTabs([
    { id: 1, title: "One", url: "https://example.com" },
    { id: 2, title: "Two", url: "https://example.com/" },
    { id: 3, title: "Three", url: "https://example.com/docs" },
    { id: 4, title: "Four", url: "https://example.com/" },
    { id: 5, title: "Internal", url: "chrome://newtab/" },
  ]);

  assert.deepEqual(groups.map((group) => [group.url, group.retainedTabId, group.tabs.map((tab) => tab.id)]), [
    ["https://example.com/", 1, [1, 2, 4]],
  ]);
});

test("validates local workspace snapshots without unsupported URLs", () => {
  const snapshot = validateWorkspaceSnapshot({
    id: "workspace-1", title: "Research", createdAt: "2026-07-23T00:00:00.000Z",
    tabs: [{ title: "Docs", url: "https://example.com/docs" }, { title: "Internal", url: "chrome://newtab/" }],
  });

  assert.equal(snapshot, null);
});

test("reports precise workspace tab validation failures", () => {
  assert.deepEqual(validateWorkspaceTab({ title: "", url: "https://example.com" }), { status: "empty-title" });
  assert.deepEqual(validateWorkspaceTab({ title: "x".repeat(161), url: "https://example.com" }), {
    status: "valid", tab: { title: "x".repeat(160), url: "https://example.com/" },
  });
  assert.deepEqual(validateWorkspaceTab({ title: "Example", url: "" }), { status: "empty-url" });
  assert.deepEqual(validateWorkspaceTab({ title: "Example", url: "not a url" }), { status: "invalid-url" });
  assert.deepEqual(validateWorkspaceTab({ title: "Example", url: "chrome://newtab/" }), { status: "unsupported-url" });
  assert.deepEqual(validateWorkspaceTab({ title: "Example", url: "https://example.com" }), {
    status: "valid", tab: { title: "Example", url: "https://example.com/" },
  });
});

test("rejects workspace snapshots whose untrimmed title exceeds the limit", () => {
  const snapshot = validateWorkspaceSnapshot({
    id: "workspace-2", title: ` ${"x".repeat(160)}`, createdAt: "2026-07-23T00:00:00.000Z",
    tabs: [{ title: "Docs", url: "https://example.com/docs" }],
  });

  assert.equal(snapshot, null);
});

test("preserves device identity on workspace snapshots", () => {
  const snapshot = validateWorkspaceSnapshot({
    id: "00000000-0000-1000-8000-000000000000", title: "Research", createdAt: "2026-07-23T00:00:00.000Z",
    tabs: [{ title: "Docs", url: "https://example.com/docs" }],
    deviceId: "device-abc", deviceName: "Mac 设备",
  });

  assert.equal(snapshot?.deviceId, "device-abc");
  assert.equal(snapshot?.deviceName, "Mac 设备");
});

test("drops blank device identity from workspace snapshots", () => {
  const snapshot = validateWorkspaceSnapshot({
    id: "00000000-0000-1000-8000-000000000000", title: "Research", createdAt: "2026-07-23T00:00:00.000Z",
    tabs: [{ title: "Docs", url: "https://example.com/docs" }],
    deviceId: "", deviceName: "   ",
  });

  assert.equal(snapshot?.deviceId, undefined);
  assert.equal(snapshot?.deviceName, undefined);
});

test("detects Edge versus Chrome from the user agent string", () => {
  assert.equal(detectBrowserKind("Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Edg/120.0 Safari/537.36"), "edge");
  assert.equal(detectBrowserKind("Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/120.0 Safari/537.36"), "chrome");
  assert.equal(detectBrowserKind(""), "chrome");
});

test("groups workspace tabs with the board rules and leaves unmatched tabs ungrouped", () => {
  const tabs = [
    { title: "A", url: "https://example.com/a" },
    { title: "B", url: "https://example.com/b" },
    { title: "C", url: "https://other.com/c" },
    { title: "D", url: "chrome://settings" },
  ];
  const groups = groupWorkspaceTabsByDomain(tabs, DEFAULT_SETTINGS, [{
    id: "rule-1", domains: ["example.com"], matchScope: "exact", title: "示例站点", color: "purple", enabled: true, sortOrder: 0,
  }], []);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].boardKey, "ungrouped");
  assert.equal(groups[0].kind, "ungrouped");
  assert.deepEqual(groups[0].tabs.map((tab) => tab.id), [2, 3]);
  assert.equal(groups[1].boardKey, "auto:example.com");
  assert.equal(groups[1].title, "示例站点");
  assert.equal(groups[1].color, "purple");
  assert.deepEqual(groups[1].tabs.map((tab) => tab.id), [0, 1]);
});

test("keeps an empty ungrouped card for an empty workspace", () => {
  const groups = groupWorkspaceTabsByDomain([], DEFAULT_SETTINGS, [], []);
  assert.deepEqual(groups.map((group) => [group.boardKey, group.tabs.length]), [["ungrouped", 0]]);
});

test("moves, updates, removes and appends workspace tabs immutably", () => {
  const tabs = [{ title: "A", url: "https://a.com" }, { title: "B", url: "https://b.com" }, { title: "C", url: "https://c.com" }];
  assert.deepEqual(moveWorkspaceTab(tabs, 0, 2)?.map((tab) => tab.url), ["https://b.com", "https://c.com", "https://a.com"]);
  assert.equal(moveWorkspaceTab(tabs, 0, 0), null);
  assert.equal(moveWorkspaceTab(tabs, -1, 1), null);
  assert.equal(updateWorkspaceTab(tabs, 1, "B2", "https://b.com/x")?.[1].title, "B2");
  assert.equal(updateWorkspaceTab(tabs, 1, "   ", "https://b.com"), null);
  assert.equal(updateWorkspaceTab(tabs, 9, "X", "https://x.com"), null);
  assert.equal(removeWorkspaceTab(tabs, 1)?.length, 2);
  assert.equal(removeWorkspaceTab(tabs, 9), null);
  assert.equal(appendWorkspaceTab(tabs, { title: "D", url: "https://d.com" })?.length, 4);
  assert.equal(appendWorkspaceTab(tabs, { title: "", url: "https://d.com" }), null);
  assert.equal(tabs.length, 3);
});

test("exposes workspace board and tab edit messages", async () => {
  const bg = await readFile(new URL("../dist/background.js", import.meta.url), "utf8");
  assert.match(bg, /message\.type === "get-workspace-board"/);
  assert.match(bg, /message\.type === "restore-workspace-tabs"/);
  assert.match(bg, /message\.type === "update-workspace-tab"/);
  assert.match(bg, /message\.type === "remove-workspace-tab"/);
  assert.match(bg, /message\.type === "move-workspace-tab"/);
});

test("renders scope navigation and editable workspace boards", async () => {
  const [html, script, css] = await Promise.all([
    readFile(new URL("../dist/board.html", import.meta.url), "utf8"),
    readFile(new URL("../dist/board.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/board.css", import.meta.url), "utf8"),
  ]);
  assert.match(html, /id="scope-nav"/);
  assert.match(html, /id="workspace-header"/);
  assert.match(script, /type: "get-workspace-board"/);
  assert.match(script, /function previewWorkspaceCardRestore/);
  assert.match(script, /type: "restore-workspace-tabs"/);
  assert.match(script, /deferred-action deferred-open/);
  assert.match(script, /renderWorkspaceBoard/);
  const currentCard = script.slice(script.indexOf("function renderCard("), script.indexOf("function renderWindowFilter("));
  const workspaceCard = script.slice(script.indexOf("function renderWorkspaceCard("), script.indexOf("function faviconFor("));
  assert.doesNotMatch(currentCard, /previewWorkspaceCardRestore/);
  assert.match(workspaceCard, /previewWorkspaceCardRestore/);
  assert.match(css, /\.scope-nav/);
  assert.match(css, /\.workspace-tab/);
  assert.match(html, /id="confirm-workspace-restore"[^>]*>确认<\/button>/);
  assert.match(html, /class="workspace-restore-actions"/);
  assert.match(script, /workspace-restore-tab/);
  assert.match(script, /faviconFor\(tab\.url\)/);
  assert.match(css, /\.workspace-restore-actions \{[^}]*justify-content: space-between/);
});

test("renders options from cache and syncs in the background", async () => {
  const [script, bg] = await Promise.all([
    readFile(new URL("../dist/options.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/background.js", import.meta.url), "utf8"),
  ]);
  assert.match(bg, /message\.type === "sync-options"/);
  assert.match(script, /type: "sync-options"/);
});

test("normalizes unique workspace names and rejects empty or duplicate names", () => {
  assert.deepEqual(validateWorkspaceTitle("  Research  ", []), { status: "valid", title: "Research" });
  assert.deepEqual(validateWorkspaceTitle("x".repeat(80), []), { status: "valid", title: "x".repeat(80) });
  assert.deepEqual(validateWorkspaceTitle(null, []), { status: "invalid" });
  assert.deepEqual(validateWorkspaceTitle("   ", []), { status: "empty" });
  assert.deepEqual(validateWorkspaceTitle(" research ", ["Research"]), { status: "duplicate" });
  assert.deepEqual(validateWorkspaceTitle("Research", [null, "Research"]), { status: "duplicate" });
  assert.deepEqual(validateWorkspaceTitle("Work", ["work"]), { status: "duplicate" });
  assert.deepEqual(validateWorkspaceTitle("x".repeat(161), []), { status: "valid", title: "x".repeat(160) });
});

test("validates deferred web tabs and computes due state", () => {
  const tab = validateDeferredTab({ id: "deferred-1", title: "Read later", url: "https://example.com", dueAt: "2026-07-24T00:00:00.000Z", createdAt: "2026-07-23T00:00:00.000Z" });
  assert.equal(tab?.url, "https://example.com/");
  assert.ok(tab);
  assert.equal(isDeferredTabDue(tab, Date.parse("2026-07-24T00:00:00.000Z")), true);
  assert.equal(isDeferredTabDue(tab, Date.parse("2026-07-23T23:59:59.000Z")), false);
});

test("formats deferred times with a fixed local date-time pattern", async () => {
  const shared = await import("../dist/shared.js");
  assert.equal(typeof shared.formatDeferredDateTime, "function");
  const localTime = new Date(2026, 6, 23, 17, 59).toISOString();
  assert.equal(shared.formatDeferredDateTime(localTime), "2026-07-23 17:59");
});

test("keeps deferred tabs when a decorative favicon is too large", () => {
  const tab = validateDeferredTab({
    id: "deferred-2",
    title: "Read later",
    url: "https://example.com/article",
    favIconUrl: `data:image/png;base64,${"a".repeat(5_000)}`,
    dueAt: "2026-07-24T00:00:00.000Z",
    createdAt: "2026-07-23T00:00:00.000Z",
  });

  assert.ok(tab);
  assert.equal(tab.favIconUrl, undefined);
});

test("normalizes up to five unique deferred shortcut times", () => {
  assert.deepEqual(normalizeDeferredShortcutTimes(undefined), ["09:00", "14:00", "18:00"]);
  assert.deepEqual(normalizeDeferredShortcutTimes(["14:00", "09:00", "14:00", "18:00"]), ["14:00", "09:00", "18:00"]);
  assert.equal(normalizeDeferredShortcutTimes(["25:00"]), null);
  assert.equal(normalizeDeferredShortcutTimes(["09:00", "10:00", "11:00", "12:00", "13:00", "14:00"]), null);
});

test("renders a compact accessible deferred shortcut editor", async () => {
  const [html, script, css] = await Promise.all([
    readFile(new URL("../dist/options.html", import.meta.url), "utf8"),
    readFile(new URL("../dist/options.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/options.css", import.meta.url), "utf8"),
  ]);

  const shortcutCardClasses = html.match(/<section[^>]*\bclass="([^"]*\bshortcut-card\b[^"]*)"/)?.[1]?.split(/\s+/);
  assert.ok(shortcutCardClasses?.includes("card"));
  assert.ok(shortcutCardClasses.includes("shortcut-card"));
  assert.match(html, /<[^>]+(?=[^>]*\bid="deferred-shortcut-count")(?=[^>]*\baria-live="polite")[^>]*>/);
  assert.match(html, /id="deferred-shortcut-note"/);
  assert.match(script, /const MAX_DEFERRED_SHORTCUTS = 5/);
  assert.match(script, /className = "deferred-shortcut"/);
  assert.match(script, /input\.ariaLabel = i18n\.t\("shortcutTimes"\)/);
  assert.match(script, /remove\.ariaLabel = i18n\.t\("delete"\)/);
  assert.match(script, /input\.ariaLabel = i18n\.t\("shortcutTimes"\) \+ ` \$\{index \+ 1\}`/);
  assert.match(script, /remove\.ariaLabel = i18n\.t\("delete"\) \+ ` \$\{index \+ 1\}`/);
  assert.match(script, /deferredShortcutCount\.textContent = `\$\{count\} \/ \$\{MAX_DEFERRED_SHORTCUTS\}`;/);
  assert.match(script, /if \(count >= MAX_DEFERRED_SHORTCUTS\)\s*return;/);
  assert.match(script, /addDeferredShortcut\.hidden = count >= MAX_DEFERRED_SHORTCUTS/);
  assert.match(script, /remove\.disabled = count <= 1/);
  assert.match(script, /focusTarget\?\.\s*focus\(\)/);
  assert.match(script, /input\?\.focus\(\)/);
  assert.match(css, /\.deferred-shortcuts\s*\{/);
  assert.match(css, /\.deferred-shortcut-input\s*\{[^}]*width: 92px;/);
  assert.match(css, /\.deferred-shortcut:focus-within/);
  assert.match(css, /\.deferred-shortcut-remove:hover/);
});

test("detects Mac platforms from common navigator.platform values", () => {
  assert.equal(isMacPlatform("MacIntel"), true);
  assert.equal(isMacPlatform("MacPPC"), true);
  assert.equal(isMacPlatform("MacARM64"), true);
  assert.equal(isMacPlatform("iPhone"), true);
  assert.equal(isMacPlatform("iPad"), true);
  assert.equal(isMacPlatform("Win32"), false);
  assert.equal(isMacPlatform("Linux x86_64"), false);
  assert.equal(isMacPlatform(undefined), false);
  assert.equal(isMacPlatform(""), false);
});

test("formats shortcut keys with platform-specific glyphs", () => {
  assert.equal(formatShortcutKeys("Alt+B", "mac"), "⌥+B");
  assert.equal(formatShortcutKeys("Command+B", "mac"), "⌘+B");
  assert.equal(formatShortcutKeys("Command+Shift+D", "mac"), "⌘+⇧+D");
  assert.equal(formatShortcutKeys("Ctrl+Alt+S", "mac"), "⌃+⌥+S");
  assert.equal(formatShortcutKeys("Alt+B", "other"), "Alt+B");
  assert.equal(formatShortcutKeys("Command+B", "other"), "Ctrl+B");
  assert.equal(formatShortcutKeys("Command+Shift+S", "other"), "Ctrl+Shift+S");
  assert.equal(formatShortcutKeys("MacCtrl+E", "other"), "Ctrl+E");
  assert.equal(formatShortcutKeys("", "mac"), "");
  assert.equal(formatShortcutKeys("", "other"), "");
});

test("formats Mac symbol-format shortcuts returned by chrome.commands.getAll()", () => {
  assert.equal(formatShortcutKeys("⌘B", "mac"), "⌘+B");
  assert.equal(formatShortcutKeys("⌥D", "mac"), "⌥+D");
  assert.equal(formatShortcutKeys("⌃⇧S", "mac"), "⌃+⇧+S");
  assert.equal(formatShortcutKeys("⌘⌥⇧X", "mac"), "⌘+⌥+⇧+X");
  assert.equal(formatShortcutKeys("B", "mac"), "B");
});

test("declares three built-in shortcut commands matching the manifest", () => {
  assert.equal(SHORTCUT_COMMANDS.length, 3);
  const commands = SHORTCUT_COMMANDS.map((entry) => entry.command);
  assert.deepEqual(commands, ["open-tab-board", "defer-active-tab", "save-workspace"]);
  for (const entry of SHORTCUT_COMMANDS) {
    assert.match(entry.defaultKey, /^Alt\+[A-Z]$/);
    assert.match(entry.macKey, /^Command\+[A-Z]$/);
  }
});

test("renders the shortcut keys card on the options page", async () => {
  const [html, script, manifest, css] = await Promise.all([
    readFile(new URL("../dist/options.html", import.meta.url), "utf8"),
    readFile(new URL("../dist/options.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/manifest.json", import.meta.url), "utf8"),
    readFile(new URL("../dist/options.css", import.meta.url), "utf8"),
  ]);
  assert.match(html, /<section[^>]*\bid="shortcut-keys-card"/);
  assert.match(html, /<ul[^>]*\bid="shortcut-list"/);
  assert.match(html, /<button[^>]*\bid="open-shortcut-settings"/);
  assert.match(html, /data-i18n="shortcutKeys"/);
  assert.match(html, /data-i18n="shortcutKeysEditButton"/);
  assert.match(script, /renderShortcutKeys/);
  assert.match(script, /renderShortcutKeysWithValues/);
  assert.match(script, /formatShortcutKeys/);
  assert.match(script, /isMacPlatform/);
  assert.match(script, /chrome\.commands\.getAll/);
  assert.match(script, /chrome:\/\/extensions\/shortcuts/);
  assert.match(css, /\.shortcut-keys-list\s*\{/);
  assert.match(css, /\.shortcut-keys-key\s*\{/);
  assert.match(css, /shortcut-keys-not-set/);
  const commands = JSON.parse(manifest).commands;
  assert.equal(commands["open-tab-board"].suggested_key.mac, "Command+B");
  assert.equal(commands["defer-active-tab"].suggested_key.mac, "Command+D");
  assert.equal(commands["save-workspace"].suggested_key.mac, "Command+S");
  assert.equal(commands["open-tab-board"].suggested_key.default, "Alt+B");
  assert.equal(commands["defer-active-tab"].suggested_key.default, "Alt+D");
  assert.equal(commands["save-workspace"].suggested_key.default, "Alt+S");
});

test("builds local deferred-tab handlers", async () => {
  const background = await readFile(new URL("../dist/background.js", import.meta.url), "utf8");
  assert.match(background, /message\.type === "defer-board-tab"/);
  assert.match(background, /message\.type === "get-deferred-tabs"/);
  assert.match(background, /message\.type === "open-deferred-tab"/);
  assert.match(background, /message\.type === "reschedule-deferred-tab"/);
  assert.match(background, /message\.type === "delete-deferred-tab"/);
});

test("renders board-only deferred reminder controls", async () => {
  const [html, script, css] = await Promise.all([readFile(new URL("../dist/board.html", import.meta.url), "utf8"), readFile(new URL("../dist/board.js", import.meta.url), "utf8"), readFile(new URL("../dist/board.css", import.meta.url), "utf8")]);
  assert.match(html, /id="deferred-reminders"/);
  assert.match(script, /type: "defer-board-tab"/);
  assert.match(script, /type: "get-deferred-tabs"/);
  assert.match(css, /\.deferred-reminders/);
});

test("shows save-to-workspace feedback in a fixed toast above the menu", async () => {
  const [script, css] = await Promise.all([
    readFile(new URL("../dist/board.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/board.css", import.meta.url), "utf8"),
  ]);
  const menuStart = script.indexOf("async function openSaveToWorkspaceMenu");
  const menuEnd = script.indexOf("function renderDeferredRow", menuStart);
  const menu = script.slice(menuStart, menuEnd);

  assert.ok(menuStart >= 0 && menuEnd > menuStart);
  assert.match(menu, /className = "workspace-save-toast"/);
  assert.match(menu, /document\.body\.append\(menu, saveToast\)/);
  assert.doesNotMatch(menu, /menu\.(?:append|replaceChildren)\([^)]*saveToast/);
  assert.match(menu, /className = error \? "workspace-save-toast error" : "workspace-save-toast success"/);
  assert.match(menu, /saveToast\.hidden = false/);
  assert.match(menu, /showSaveToast\(i18n\.t\("workspaceSavedTo", \[workspace\.title\]\)/);
  assert.match(menu, /showSaveToast\(error instanceof Error \? error\.message : String\(error\), true\)/);
  assert.match(menu, /positionWorkspaceSaveMenu\(menu, toggleButton, saveToast\)/);
  assert.match(menu, /saveToast\.remove\(\)/);
  assert.match(menu, /toast\.style\.top = `\$\{menuTop - toast\.offsetHeight - toastGap\}px`/);
  assert.match(menu, /toast\.style\.left = `\$\{menuLeft\}px`/);
  assert.match(css, /\.workspace-save-toast \{[^}]*position: fixed/);
  assert.match(css, /\.workspace-save-toast\.success/);
  assert.match(css, /\.workspace-save-toast\.error/);
  assert.match(css, /\.workspace-save-toast\[hidden\] \{[^}]*display: none/);
});

test("reuses workspace title, tab count, and device layout in save options", async () => {
  const [script, css] = await Promise.all([
    readFile(new URL("../dist/board.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/board.css", import.meta.url), "utf8"),
  ]);

  assert.match(script, /function appendWorkspaceListItemDetails/);
  assert.match(script, /appendWorkspaceListItemDetails\(option, workspace\)/);
  assert.match(script, /appendWorkspaceListItemDetails\(item, workspace\)/);
  assert.match(script, /className = "workspace-popover-item-title"/);
  assert.match(script, /className = "workspace-popover-item-count"/);
  assert.match(script, /className = "workspace-popover-item-device"/);
  assert.match(css, /\.workspace-popover-item, \.workspace-save-option \{/);
  assert.match(css, /\.workspace-save-option:hover \.workspace-popover-item-count/);
  assert.match(css, /\.workspace-popover-list \{[^}]*overscroll-behavior: contain/);
  assert.match(css, /\.workspace-save-menu \{[^}]*overscroll-behavior: contain/);
});

test("renders every scheduled reminder with clear status and actions", async () => {
  const [script, css] = await Promise.all([
    readFile(new URL("../dist/board.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/board.css", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(script, /\.filter\(\(tab\) => isDeferredTabDue\(tab\)\)/);
  assert.match(script, /isDeferredTabDue\(tab\)/);
  assert.match(script, /deferred-open/);
  assert.match(script, /deferred-delete/);
  assert.match(script, /deferred-status/);
  assert.match(script, /deferred-icon/);
  assert.match(script, /tab\.favIconUrl/);
  assert.match(script, /github-tab-icon/);
  assert.match(css, /\.deferred-open/);
  assert.match(css, /\.deferred-delete/);
  assert.match(css, /\.deferred-status/);
  assert.match(css, /\.deferred-row \{[^}]*min-height: 40px/);
  assert.match(css, /\.deferred-title \{[^}]*flex: 1/);
  assert.match(css, /\.deferred-actions \{[^}]*flex: 0 0 auto/);
  assert.doesNotMatch(css, /\.deferred-actions \{[^}]*(?:opacity: 0|display: none|visibility: hidden)/);
});

test("renders a configured deferred shortcut menu", async () => {
  const [script, css] = await Promise.all([readFile(new URL("../dist/board.js", import.meta.url), "utf8"), readFile(new URL("../dist/board.css", import.meta.url), "utf8")]);
  assert.match(script, /deferredShortcutTimes/);
  assert.match(script, /defer-menu/);
  assert.match(script, /i18n\.t\("countdown"\)/);
  assert.doesNotMatch(script, /i18n\.t\("customTime"\)/);
  assert.match(css, /\.defer-menu/);
});

test("consumes a deferred reminder only after it opens successfully", async () => {
  const [background, board] = await Promise.all([
    readFile(new URL("../dist/background.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/board.js", import.meta.url), "utf8"),
  ]);
  const openHandlerStart = background.indexOf('if (message.type === "open-deferred-tab")');
  const openHandlerEnd = background.indexOf('if (message.type === "reschedule-deferred-tab")', openHandlerStart);
  const openHandler = background.slice(openHandlerStart, openHandlerEnd);

  assert.ok(openHandlerStart >= 0 && openHandlerEnd > openHandlerStart);
  assert.match(openHandler, /await chrome\.tabs\.create/);
  assert.match(openHandler, /await saveDeferredTabs/);
  assert.ok(openHandler.indexOf("await chrome.tabs.create") < openHandler.indexOf("await saveDeferredTabs"));
  assert.match(openHandler, /deferredTabs\.filter\(\(item\) => item\.id !== message\.id\)/);
  assert.match(board, /type: "open-deferred-tab"[\s\S]*Promise\.all\(\[renderDeferredTabs\(\), renderBoardStatistics\(\)\]\)/);
});

test("builds a read-only board statistics handler", async () => {
  const [background, board] = await Promise.all([
    readFile(new URL("../dist/background.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/board.js", import.meta.url), "utf8"),
  ]);
  assert.match(background, /message\.type === "get-board-statistics"/);
  assert.match(background, /duplicateTabCount/);
  assert.match(background, /deferredTabCount/);
  assert.match(background, /dueDeferredCount: deferredTabCount/);
  assert.match(board, /stats\.deferredTabCount \?\? stats\.dueDeferredCount \?\? 0/);
});

test("renders board statistics cards", async () => {
  const [html, script, css] = await Promise.all([readFile(new URL("../dist/board.html", import.meta.url), "utf8"), readFile(new URL("../dist/board.js", import.meta.url), "utf8"), readFile(new URL("../dist/board.css", import.meta.url), "utf8")]);
  assert.match(html, /id="board-stats-inline"/);
  assert.match(script, /type: "get-board-statistics"/);
  assert.match(css, /\.board-stats-inline/);
});

test("builds local workspace save, preview, restore, and delete handlers", async () => {
  const background = await readFile(new URL("../dist/background.js", import.meta.url), "utf8");

  assert.match(background, /message\.type === "save-workspace"/);
  assert.match(background, /existing\.filter\(\(workspace\) => workspace\.deviceName === deviceName\)\.map\(\(workspace\) => workspace\.title\)/);
  assert.match(background, /validateWorkspaceTitle\(message\.title, existingTitles\)/);
  assert.match(background, /upsertWorkspace/);
  assert.match(background, /fetchWorkspaces/);
  assert.match(background, /deleteWorkspaceRow/);
  assert.match(background, /renameDeviceWorkspaces/);
  assert.match(background, /getOrCreateDeviceId/);
  assert.match(background, /device: \{ id: deviceId, name: deviceName \}/);
  assert.match(background, /i18n\.t\("workspaceNameEmpty"\)/);
  assert.match(background, /i18n\.t\("workspaceNameDuplicate"\)/);
  assert.match(background, /message\.type === "get-workspace-restore-preview"/);
  assert.match(background, /message\.type === "restore-workspace"/);
  assert.match(background, /message\.confirmed !== true/);
  assert.match(background, /chrome\.tabs\.create/);
  assert.match(background, /message\.type === "delete-workspace"/);
  assert.match(background, /message\.type === "set-device-name"/);
  assert.match(background, /i18n\.t\("deviceNameInvalid"\)/);
});

test("renders local workspace selection and restore-preview dialogs", async () => {
  const [html, script, css] = await Promise.all([
    readFile(new URL("../dist/board.html", import.meta.url), "utf8"),
    readFile(new URL("../dist/board.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/board.css", import.meta.url), "utf8"),
  ]);
  assert.match(html, /id="open-workspaces"/);
  assert.match(html, /id="workspace-dialog"/);
  assert.match(html, /id="workspace-restore-dialog"/);
  assert.match(html, /class="workspace-name-field"/);
  assert.match(html, /class="workspace-controls"/);
  assert.match(html, /<label\b(?=[^>]*\bclass="workspace-select-all")[^>]*>\s*<input\b(?=[^>]*\bid="workspace-select-all")(?=[^>]*\btype="checkbox")(?=[^>]*\bchecked)[^>]*>\s*<span[^>]*data-i18n="selectAll">/);
  assert.match(html, /<input\b(?=[^>]*\bid="workspace-name")(?=[^>]*\baria-describedby="workspace-name-error")(?=[^>]*\baria-invalid="false")[^>]*>/);
  assert.match(html, /<p\b(?=[^>]*\bid="workspace-name-error")(?=[^>]*\bclass="workspace-name-toast")(?=[^>]*\brole="alert")(?=[^>]*\bhidden)[^>]*><\/p>/);
  assert.match(script, /type: "save-workspace"/);
  assert.match(script, /validateWorkspaceTitle\(workspaceName\.value, workspaces\.filter\(\(workspace\) => workspace\.deviceName === currentDevice\?\.name\)\.map\(\(workspace\) => workspace\.title\)\)/);
  assert.match(script, /showWorkspaceNameError\(i18n\.t\("workspaceNameEmpty"\)\)/);
  assert.match(script, /showWorkspaceNameError\(i18n\.t\("workspaceNameDuplicate"\)\)/);
  assert.match(script, /workspaceName\.addEventListener\("input", clearWorkspaceNameError\)/);
  assert.match(script, /workspaceDialog\.addEventListener\("close", clearWorkspaceNameError\)/);
  assert.match(script, /function workspaceTabInputs\(\)/);
  assert.match(script, /function syncWorkspaceSelectAll\(\)/);
  assert.match(script, /workspaceSelectAll\.disabled = inputs\.length === 0/);
  assert.match(script, /workspaceSelectAll\.indeterminate = checkedCount > 0 && checkedCount < inputs\.length/);
  assert.match(script, /workspaceSelectAll\.addEventListener\("change"/);
  assert.match(script, /input\.checked = workspaceSelectAll\.checked/);
  assert.match(script, /workspaceTabs\.addEventListener\("change"/);
  assert.match(script, /event\.target instanceof HTMLInputElement && event\.target\.type === "checkbox"/);

  const saveStart = script.indexOf("async function saveCurrentWorkspace");
  const saveEnd = script.indexOf("async function previewWorkspaceRestore", saveStart);
  assert.ok(saveStart >= 0 && saveEnd > saveStart);
  const saveCurrentWorkspace = script.slice(saveStart, saveEnd);
  const validationCall = "validateWorkspaceTitle(workspaceName.value, workspaces.filter((workspace) => workspace.deviceName === currentDevice?.name).map((workspace) => workspace.title))";
  const saveMessage = 'await send({ type: "save-workspace"';
  assert.ok(saveCurrentWorkspace.indexOf(validationCall) < saveCurrentWorkspace.indexOf(saveMessage));
  assert.match(saveCurrentWorkspace, /if \(title\.status === "empty"\) \{\s*showWorkspaceNameError\(i18n\.t\("workspaceNameEmpty"\)\);\s*return;\s*\}/);
  assert.match(saveCurrentWorkspace, /if \(title\.status === "duplicate"\) \{\s*showWorkspaceNameError\(i18n\.t\("workspaceNameDuplicate"\)\);\s*return;\s*\}/);

  const catchStart = /catch\s*\(error\)\s*\{/.exec(saveCurrentWorkspace)?.index ?? -1;
  const catchEnd = saveCurrentWorkspace.indexOf("  workspaceName.value", catchStart);
  assert.ok(catchStart >= 0 && catchEnd > catchStart);
  const saveCatch = saveCurrentWorkspace.slice(catchStart, catchEnd);
  assert.match(saveCatch, /if \(error instanceof Error\) \{\s*showWorkspaceError\(error\.message\);\s*return;\s*\}/);
  assert.match(saveCatch, /throw error;/);

  const clearStart = script.indexOf("function clearWorkspaceNameError");
  const showErrorStart = script.indexOf("function showWorkspaceError", clearStart);
  const showStart = script.indexOf("function showWorkspaceNameError", showErrorStart);
  assert.ok(clearStart >= 0 && showErrorStart > clearStart && showStart > showErrorStart);
  const clearWorkspaceNameError = script.slice(clearStart, showErrorStart);
  const showWorkspaceError = script.slice(showErrorStart, showStart);
  const showWorkspaceNameError = script.slice(showStart, saveStart);
  assert.match(clearWorkspaceNameError, /workspaceNameError\.hidden = true;/);
  assert.match(clearWorkspaceNameError, /workspaceNameError\.textContent = "";/);
  assert.match(clearWorkspaceNameError, /workspaceName\.classList\.remove\("workspace-name-input-invalid"\)/);
  assert.match(clearWorkspaceNameError, /workspaceName\.setAttribute\("aria-invalid", "false"\)/);
  assert.match(showWorkspaceError, /workspaceNameError\.textContent = message;/);
  assert.match(showWorkspaceError, /workspaceNameError\.hidden = false;/);
  assert.match(showWorkspaceNameError, /showWorkspaceError\(message\)/);
  assert.match(showWorkspaceNameError, /workspaceName\.classList\.add\("workspace-name-input-invalid"\)/);
  assert.match(showWorkspaceNameError, /workspaceName\.setAttribute\("aria-invalid", "true"\)/);
  assert.match(showWorkspaceNameError, /workspaceName\.focus\(\)/);

  const successStatements = ["workspaceName.value = \"\";", "clearWorkspaceNameError();", "await loadWorkspaces();", 'showStatus(i18n.t("workspaceSaved"));'];
  let priorStatement = -1;
  for (const statement of successStatements) {
    const statementIndex = saveCurrentWorkspace.indexOf(statement);
    assert.ok(statementIndex > priorStatement, `Expected ${statement} after the prior success step`);
    priorStatement = statementIndex;
  }

  assert.match(script, /type: "get-workspace-restore-preview"/);
  assert.match(script, /type: "restore-workspace"/);
  assert.match(script, /className = "deferred-actions"/);
  assert.match(script, /makeButton\(i18n\.t\("restore"\), "deferred-action deferred-open"/);
  assert.match(script, /makeButton\(i18n\.t\("delete"\), "deferred-action deferred-delete"/);
  assert.match(script, /i18n\.t\("currentDevice"\)/);
  assert.match(script, /workspace-device/);
  assert.match(css, /\.workspace-device/);
  assert.match(css, /\.workspace-device-badge/);
  assert.match(html, /id="workspace-device-name"/);
  assert.match(html, /class="workspace-device-bar"/);
  assert.match(script, /set-device-name/);
  assert.match(script, /"Escape"/);
  assert.match(script, /workspaceDeviceName\.blur\(\)/);
  assert.match(css, /\.workspace-device-input/);
  assert.match(css, /\.workspace-dialog/);
  assert.match(css, /\.workspace-name-toast/);
  assert.match(css, /\.workspace-controls\s*\{[^}]*display: flex;[^}]*flex-wrap: wrap;/);
  assert.match(css, /\.workspace-select-all\s*\{[^}]*display: inline-flex;/);
  assert.match(css, /\.workspace-name-input-invalid/);
  assert.match(css, /\.workspace-name-toast\[hidden\]/);
  const mobileStart = css.indexOf("@media (max-width: 640px)");
  assert.ok(mobileStart >= 0);
  const mobileCss = css.slice(mobileStart);
  assert.match(mobileCss, /\.workspace-name-toast\s*\{[^}]*position: static;[^}]*width: 100%;[^}]*transform: none;/);
  assert.match(mobileCss, /\.workspace-name-toast::before\s*\{[^}]*display: none;/);
});

test("makes only the workspace manager dialog resizable", async () => {
  const [html, css, script] = await Promise.all([
    readFile(new URL("../dist/board.html", import.meta.url), "utf8"),
    readFile(new URL("../dist/board.css", import.meta.url), "utf8"),
    readFile(new URL("../dist/board.js", import.meta.url), "utf8"),
  ]);

  const managerDialog = html.match(/<dialog[^>]*id="workspace-dialog"[^>]*>/)?.[0] ?? "";
  assert.match(managerDialog, /class="[^"]*\bworkspace-dialog-resizable\b[^"]*"/);
  const resizableDialogs = [...html.matchAll(/<dialog\b[^>]*>/g)]
    .map((match) => match[0])
    .filter((dialog) => /class="[^"]*\bworkspace-dialog-resizable\b[^"]*"/.test(dialog));
  assert.deepEqual(resizableDialogs, [managerDialog]);

  const resizableRule = cssRule(css, ".workspace-dialog-resizable");
  assert.match(resizableRule, /\bcontainer\s*:\s*workspace-dialog\s*\/\s*inline-size\s*;/);
  assert.match(resizableRule, /\bresize\s*:\s*both\s*;/);
  assert.match(resizableRule, /\boverflow\s*:\s*hidden\s*;/);
  assert.match(resizableRule, /\boverscroll-behavior\s*:\s*contain\s*;/);
  assert.match(resizableRule, /\bmin-width\s*:\s*[^;}]+\s*;/);
  assert.match(resizableRule, /\bmin-height\s*:\s*[^;}]+\s*;/);
  assert.match(resizableRule, /\bmax-width\s*:\s*[^;}]+\s*;/);
  assert.match(resizableRule, /\bmax-height\s*:\s*[^;}]+\s*;/);
  const resizableOpenRule = cssRule(css, ".workspace-dialog-resizable[open]");
  assert.match(resizableOpenRule, /\bdisplay\s*:\s*flex\s*;/);
  assert.match(resizableOpenRule, /\bflex-direction\s*:\s*column\s*;/);
  const anchoredRule = cssRule(css, ".workspace-dialog-resize-anchored");
  assert.match(anchoredRule, /\bposition\s*:\s*fixed\s*;/);
  assert.match(anchoredRule, /\binset\s*:\s*var\(--workspace-dialog-top\)\s+auto\s+auto\s+var\(--workspace-dialog-left\)\s*;/);
  assert.match(anchoredRule, /\bmargin\s*:\s*0\s*;/);
  assert.match(anchoredRule, /\bmax-width\s*:\s*calc\(100vw\s*-\s*var\(--workspace-dialog-left\)\s*-\s*16px\)\s*;/);
  assert.match(anchoredRule, /\bmax-height\s*:\s*calc\(100vh\s*-\s*var\(--workspace-dialog-top\)\s*-\s*16px\)\s*;/);
  const workspaceTabsRule = cssRule(css, ".workspace-dialog-resizable .workspace-tabs");
  assert.match(workspaceTabsRule, /\bflex\s*:\s*[^;}]+\s*;/);
  assert.match(workspaceTabsRule, /\bmax-height\s*:\s*none\s*;/);
  assert.match(workspaceTabsRule, /\boverscroll-behavior\s*:\s*contain\s*;/);
  const workspaceListRule = cssRule(css, ".workspace-dialog-resizable .workspace-list");
  assert.match(workspaceListRule, /\bmax-height\s*:\s*none\s*;/);
  assert.match(workspaceListRule, /\bflex\s*:\s*1\s+1\s+0\s*;/);
  assert.match(workspaceListRule, /\boverflow\s*:\s*auto\s*;/);

  const narrowDialogCss = cssBlocks(css)
    .find((block) => normalizedCssSelector(block.selector) === "@container workspace-dialog (max-width: 520px)")?.body ?? "";
  assert.notEqual(narrowDialogCss, "");
  const narrowToastRule = cssRule(narrowDialogCss, ".workspace-dialog-resizable .workspace-name-toast");
  assert.match(narrowToastRule, /\bposition\s*:\s*static\s*;/);
  assert.match(narrowToastRule, /\bmargin-top\s*:\s*8px\s*;/);
  assert.match(narrowToastRule, /\bwidth\s*:\s*100%\s*;/);
  assert.match(narrowToastRule, /\bmax-width\s*:\s*none\s*;/);
  const narrowToastArrowRule = cssRule(narrowDialogCss, ".workspace-dialog-resizable .workspace-name-toast::before");
  assert.match(narrowToastArrowRule, /\bdisplay\s*:\s*none\s*;/);

  const mobileCss = cssMediaBlock(css, "max-width\\s*:\\s*640px");
  assert.notEqual(mobileCss, "");
  const mobileResizableRule = cssRule(mobileCss, ".workspace-dialog-resizable");
  assert.match(mobileResizableRule, /\bheight\s*:\s*auto\s*;/);
  assert.match(mobileResizableRule, /\bresize\s*:\s*none\s*;/);
  const mobileAnchoredRule = cssRule(mobileCss, ".workspace-dialog-resize-anchored");
  assert.match(mobileAnchoredRule, /\binset\s*:\s*0\s*;/);
  assert.match(mobileAnchoredRule, /\bmargin\s*:\s*auto\s*;/);
  const mobileResizableOpenRule = cssRule(mobileCss, ".workspace-dialog-resizable[open]");
  assert.match(mobileResizableOpenRule, /\bdisplay\s*:\s*block\s*;/);
  const mobileWorkspaceTabsRule = cssRule(mobileCss, ".workspace-dialog-resizable .workspace-tabs");
  assert.match(mobileWorkspaceTabsRule, /\bmax-height\s*:\s*200px\s*;/);
  const mobileToastRule = cssRule(mobileCss, ".workspace-dialog-resizable .workspace-name-toast");
  assert.match(mobileToastRule, /\bmargin-top\s*:\s*6px\s*;/);
  const mobileWorkspaceListRule = cssRule(mobileCss, ".workspace-dialog-resizable .workspace-list");
  assert.match(mobileWorkspaceListRule, /\bwidth\s*:\s*auto\s*;/);
  assert.match(mobileWorkspaceListRule, /\bmax-height\s*:\s*none\s*;/);
  assert.match(mobileWorkspaceListRule, /\boverflow\s*:\s*visible\s*;/);

  const anchorStart = script.indexOf("function syncWorkspaceDialogResizeAnchor");
  const openStart = script.indexOf("async function openWorkspaceDialog", anchorStart);
  assert.ok(anchorStart >= 0 && openStart > anchorStart);
  const anchorFunction = script.slice(anchorStart, openStart);
  assert.match(anchorFunction, /workspaceDialog\.getBoundingClientRect\(\)/);
  assert.match(script, /WORKSPACE_DIALOG_MOBILE_MAX_WIDTH\s*=\s*640/);
  assert.match(anchorFunction, /window\.innerWidth <= WORKSPACE_DIALOG_MOBILE_MAX_WIDTH/);
  assert.match(anchorFunction, /workspaceDialog\.classList\.remove\("workspace-dialog-resize-anchored"\)/);
  assert.match(anchorFunction, /workspaceDialog\.style\.setProperty\("--workspace-dialog-left"/);
  assert.match(anchorFunction, /workspaceDialog\.style\.setProperty\("--workspace-dialog-top"/);
  assert.match(anchorFunction, /workspaceDialog\.classList\.add\("workspace-dialog-resize-anchored"\)/);

  const openEnd = script.indexOf("function clearWorkspaceNameError", openStart);
  const openFunction = script.slice(openStart, openEnd);
  const showModalIndex = openFunction.indexOf("workspaceDialog.showModal()");
  const anchorIndex = openFunction.indexOf("syncWorkspaceDialogResizeAnchor()");
  const dragIndex = openFunction.indexOf("makeWorkspaceDialogDraggable()");
  assert.ok(showModalIndex >= 0 && anchorIndex > showModalIndex);
  assert.ok(dragIndex > anchorIndex);
  assert.match(script, /function makeWorkspaceDialogDraggable/);
  assert.match(script, /workspace-dialog-header/);
  assert.match(script, /addEventListener\("mousedown"/);
  assert.match(script, /document\.addEventListener\("mousemove"/);
  assert.match(script, /document\.addEventListener\("mouseup"/);
  assert.match(css, /\.workspace-dialog-header \{[^}]*cursor: grab/);
  assert.match(script, /window\.addEventListener\("resize", \(\) => \{\s*syncWorkspaceDialogResizeAnchor\(\);/);
});

test("builds duplicate preview and explicit batch-close handlers", async () => {
  const background = await readFile(new URL("../dist/background.js", import.meta.url), "utf8");

  assert.match(background, /message\.type === "get-board-duplicate-preview"/);
  assert.match(background, /findDuplicateBoardTabs/);
  assert.match(background, /message\.type === "close-board-duplicates"/);
  assert.match(background, /message\.confirmed !== true/);
  assert.match(background, /chrome\.tabs\.remove/);
});

test("renders a duplicate review dialog before batch closure", async () => {
  const [html, script, css] = await Promise.all([
    readFile(new URL("../dist/board.html", import.meta.url), "utf8"),
    readFile(new URL("../dist/board.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/board.css", import.meta.url), "utf8"),
  ]);

  assert.match(html, /id="review-duplicates"/);
  assert.match(html, /id="duplicate-review-dialog"/);
  assert.match(script, /type: "get-board-duplicate-preview"/);
  assert.match(script, /type: "close-board-duplicates"/);
  assert.match(css, /\.duplicate-review/);
});

test("builds board cards from ten-tab segments and retains an empty custom card", () => {
  const tabs = Array.from({ length: 11 }, (_value, index) => ({ id: index + 1, title: `Tab ${index + 1}` }));
  const cards = buildBoardCards([
    { boardKey: "custom:7c5e0df8-d6b4-4b10-a820-2d1d1ef9b573", kind: "custom", title: "Empty", color: "purple", rank: 0, tabs: [] },
    { boardKey: "auto:example.com", kind: "automatic", title: "Example", color: "blue", rank: 1, tabs },
  ]);

  assert.deepEqual(cards.map((card) => [card.boardKey, card.segmentIndex, card.segmentCount, card.tabs.length, card.heightUnits]), [
    ["custom:7c5e0df8-d6b4-4b10-a820-2d1d1ef9b573", 0, 1, 0, 1],
    ["auto:example.com", 0, 2, 10, 2],
    ["auto:example.com", 1, 2, 1, 1],
  ]);
});

test("moves a logical board group to a new rank without moving Ungrouped", () => {
  const groups = [
    { boardKey: "ungrouped", kind: "ungrouped", title: "Ungrouped", color: "grey", rank: 0 },
    { boardKey: "auto:one.example", kind: "automatic", title: "One", color: "blue", rank: 1 },
    { boardKey: "auto:two.example", kind: "automatic", title: "Two", color: "green", rank: 2 },
  ];

  assert.deepEqual(moveBoardGroupRank(groups, "auto:two.example", 1).map((group) => [group.boardKey, group.rank]), [
    ["ungrouped", 0],
    ["auto:two.example", 1],
    ["auto:one.example", 2],
  ]);
  assert.equal(moveBoardGroupRank(groups, "ungrouped", 2), null);
});

test("rejects invalid board tab drops before Chrome state changes", () => {
  assert.equal(validateBoardTabDrop({ tabId: 1, targetBoardKey: "custom:not-a-uuid" }), null);
  assert.equal(validateBoardTabDrop({ tabId: -1, targetBoardKey: "ungrouped" }), null);
  assert.equal(validateBoardTabDrop({ tabId: 1, targetBoardKey: "ungrouped" }), null);
  assert.equal(validateBoardTabDrop({ tabId: 1, targetBoardKey: "ungrouped", position: "before" }), null);
  assert.equal(validateBoardTabDrop({ tabId: 1, targetBoardKey: "ungrouped", position: "after", targetTabId: 1 }), null);
  assert.deepEqual(validateBoardTabDrop({ tabId: 1, targetBoardKey: "ungrouped", position: "before", targetTabId: 2 }), {
    tabId: 1, targetBoardKey: "ungrouped", position: "before", targetTabId: 2,
  });
  assert.deepEqual(validateBoardTabDrop({ tabId: 1, targetBoardKey: "ungrouped", position: "append" }), {
    tabId: 1, targetBoardKey: "ungrouped", position: "append",
  });
});

test("computes final tab-strip indices for before and after board drops", () => {
  assert.equal(boardDropIndex(0, 1, "after"), 1);
  assert.equal(boardDropIndex(2, 1, "after"), 2);
  assert.equal(boardDropIndex(0, 1, "before"), 0);
  assert.equal(boardDropIndex(2, 1, "before"), 1);
  assert.equal(boardDropIndex(-1, 1, "before"), null);
});

test("moves local virtual board assignments across board keys without browser group ids", () => {
  const customKey = "custom:7c5e0df8-d6b4-4b10-a820-2d1d1ef9b573";
  const automaticKey = "auto:other.example";
  const moved = moveVirtualBoardAssignment({}, 7, 12, customKey);
  assert.deepEqual(moved, { "7:12": { windowId: 7, tabId: 12, boardKey: customKey, order: 0 } });

  const reassigned = moveVirtualBoardAssignment(moved, 7, 12, automaticKey, 3);
  assert.deepEqual(reassigned["7:12"], { windowId: 7, tabId: 12, boardKey: automaticKey, order: 3 });
  assert.deepEqual(moveVirtualBoardAssignment(reassigned, 7, 12, "ungrouped", 2), { "7:12": { windowId: 7, tabId: 12, boardKey: "ungrouped", order: 2 } });
});

test("retains manual order of ungrouped tabs across a refresh", () => {
  const settings = { autoGroupEnabled: true, minimumTabs: 2, defaultGroupColor: "blue" };
  const tabs = [
    { id: 1, windowId: 7, title: "T1", url: "https://aaa.com/a" },
    { id: 2, windowId: 7, title: "T2", url: "https://bbb.com/b" },
    { id: 3, windowId: 7, title: "T3", url: "https://ccc.com/c" },
  ];
  // Simulates the move-board-tab reduce assigning order 0,1,2 to [3,1,2] within ungrouped.
  const assignments = [3, 1, 2].reduce((acc, tabId, order) =>
    moveVirtualBoardAssignment(acc, 7, tabId, "ungrouped", order), {});
  const groups = buildVirtualBoardGroups({
    tabs, settings, rules: [], ignoredSites: [], customGroups: [], assignments, windowId: 7,
  });
  assert.deepEqual(groups.find((g) => g.boardKey === "ungrouped").tabs.map((t) => t.id), [3, 1, 2]);
});

test("pins a tab moved into ungrouped so automatic grouping no longer claims it", () => {
  const settings = { autoGroupEnabled: true, minimumTabs: 2, defaultGroupColor: "blue" };
  const tabs = [
    { id: 1, windowId: 7, title: "T1", url: "https://example.com/a" },
    { id: 2, windowId: 7, title: "T2", url: "https://example.com/b" },
    { id: 3, windowId: 7, title: "T3", url: "https://example.com/c" },
  ];
  const assignments = moveVirtualBoardAssignment({}, 7, 3, "ungrouped", 0);
  const groups = buildVirtualBoardGroups({
    tabs, settings, rules: [], ignoredSites: [], customGroups: [], assignments, windowId: 7,
  });
  assert.deepEqual(groups.find((g) => g.boardKey === "auto:example.com").tabs.map((t) => t.id), [1, 2]);
  assert.deepEqual(groups.find((g) => g.boardKey === "ungrouped").tabs.map((t) => t.id), [3]);
});

test("builds virtual automatic groups by site while custom assignments take precedence", () => {
  const customId = "7c5e0df8-d6b4-4b10-a820-2d1d1ef9b573";
  const groups = buildVirtualBoardGroups({
    windowId: 7,
    tabs: [
      { id: 1, title: "One", url: "https://www.example.com/a" },
      { id: 2, title: "Two", url: "https://example.com/b" },
      { id: 3, title: "Three", url: "https://example.com/c" },
    ],
    settings: { autoGroupEnabled: true, minimumTabs: 2, defaultGroupColor: "blue" },
    rules: [],
    ignoredSites: [],
    customGroups: [{ id: customId, title: "Research", color: "purple", sortOrder: 0 }],
    assignments: { "7:1": { windowId: 7, tabId: 1, boardKey: `custom:${customId}`, order: 0 } },
  });

  assert.deepEqual(groups.map((group) => [group.boardKey, group.tabs.map((tab) => tab.id)]), [
    ["ungrouped", []],
    [`custom:${customId}`, [1]],
    ["auto:example.com", [2, 3]],
  ]);
});

test("aggregates sites across windows while retaining each tab's custom assignment", () => {
  const customId = "7c5e0df8-d6b4-4b10-a820-2d1d1ef9b573";
  const groups = buildVirtualBoardGroups({
    windowId: 7,
    tabs: [
      { id: 1, windowId: 7, title: "First", url: "https://example.com/first" },
      { id: 2, windowId: 8, title: "Second", url: "https://example.com/second" },
    ],
    settings: { autoGroupEnabled: true, minimumTabs: 2, defaultGroupColor: "blue" },
    rules: [],
    ignoredSites: [],
    customGroups: [{ id: customId, title: "Research", color: "purple", sortOrder: 0 }],
    assignments: { "8:2": { windowId: 8, tabId: 2, boardKey: `custom:${customId}`, order: 0 } },
  });

  assert.deepEqual(groups.map((group) => [group.boardKey, group.tabs.map((tab) => tab.id)]), [
    ["ungrouped", [1]],
    [`custom:${customId}`, [2]],
  ]);
});

test("treats only explicit authentication responses as session-invalidating", () => {
  assert.equal(isExplicitAuthenticationFailure({ status: 401 }), true);
  assert.equal(isExplicitAuthenticationFailure({ status: 403 }), true);
  assert.equal(isExplicitAuthenticationFailure({ status: 500 }), false);
  assert.equal(isExplicitAuthenticationFailure(new TypeError("Failed to fetch")), false);
});

test("returns the cached user without waiting for an authentication request", async () => {
  const values = {
    supabaseSession: {
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "user-1", email: "user@example.com" },
    },
  };
  globalThis.chrome.storage = {
    local: {
      get: async (key) => key in values ? { [key]: values[key] } : {},
    },
  };
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error("The popup must not wait for this request"); };
    assert.deepEqual(await getStoredUser(), values.supabaseSession.user);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps the cached user through a transient auth network failure but clears an explicit rejection", async () => {
  const values = {
    supabaseSession: {
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "user-1", email: "user@example.com" },
    },
  };
  globalThis.chrome.storage = {
    local: {
      get: async (key) => key in values ? { [key]: values[key] } : {},
      set: async (next) => Object.assign(values, next),
      remove: async (key) => { delete values[key]; },
    },
  };
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
    assert.deepEqual(await getCurrentUser(), values.supabaseSession.user);
    assert.ok(values.supabaseSession);

    globalThis.fetch = async () => new Response(JSON.stringify({ message: "JWT expired" }), { status: 401 });
    assert.equal(await getCurrentUser(), null);
    assert.equal(values.supabaseSession, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("accepts only board keys that satisfy the database key contract", () => {
  assert.equal(automaticBoardKey("WWW.Example.com."), "auto:example.com");
  assert.equal(automaticBoardKey("localhost"), null);
  assert.equal(customBoardKey("7c5e0df8-d6b4-4b10-a820-2d1d1ef9b573"), "custom:7c5e0df8-d6b4-4b10-a820-2d1d1ef9b573");
  assert.equal(customBoardKey("7C5E0DF8-D6B4-4B10-A820-2D1D1EF9B573"), null);
});

test("converts durable board custom groups from Supabase rows", () => {
  assert.deepEqual(boardCustomGroupFromSyncRow({
    id: "7c5e0df8-d6b4-4b10-a820-2d1d1ef9b573",
    user_id: "user-1",
    title: "Research",
    color: "purple",
    sort_order: 3,
  }, "user-1"), {
    id: "7c5e0df8-d6b4-4b10-a820-2d1d1ef9b573",
    title: "Research",
    color: "purple",
    sortOrder: 3,
  });
});

test("converts an automatic board layout using a stable site key", () => {
  assert.deepEqual(boardLayoutFromSyncRow({
    user_id: "user-1",
    board_key: "auto:example.com",
    device_class: "desktop",
    rank: 2,
    auto_fill: true,
    manual_lane: null,
    manual_order: null,
  }, "user-1"), {
    boardKey: "auto:example.com",
    deviceClass: "desktop",
    rank: 2,
    autoFill: true,
  });
});

test("rejects invalid board device classes and cross-user rows", () => {
  const layout = {
    user_id: "other-user",
    board_key: "auto:example.com",
    device_class: "desktop",
    rank: 0,
    auto_fill: true,
    manual_lane: null,
    manual_order: null,
  };
  const customGroup = { id: "7c5e0df8-d6b4-4b10-a820-2d1d1ef9b573", user_id: "other-user", title: "Research", color: "blue", sort_order: 0 };

  assert.equal(boardLayoutFromSyncRow({ ...layout, user_id: "user-1", device_class: "watch" }, "user-1"), null);
  assert.equal(boardLayoutFromSyncRow(layout, "user-1"), null);
  assert.equal(boardCustomGroupFromSyncRow(customGroup, "user-1"), null);
});

test("rejects board custom groups without UUIDs and noncanonical automatic site keys", () => {
  const customGroup = {
    id: "group-1",
    user_id: "user-1",
    title: "Research",
    color: "blue",
    sort_order: 0,
  };
  const layout = {
    user_id: "user-1",
    board_key: "auto:www.example.com",
    device_class: "desktop",
    rank: 0,
    auto_fill: true,
    manual_lane: null,
    manual_order: null,
  };

  assert.equal(boardCustomGroupFromSyncRow(customGroup, "user-1"), null);
  assert.equal(boardLayoutFromSyncRow(layout, "user-1"), null);
});

test("maps board tab counts to five-row height units", () => {
  for (const tabCount of [0, 1, 2, 3, 4, 5]) {
    assert.equal(heightUnitsForTabCount(tabCount), 1);
  }
  for (const tabCount of [6, 7, 8, 9, 10]) {
    assert.equal(heightUnitsForTabCount(tabCount), 2);
  }
});

test("splits board tabs into ten-tab segments", () => {
  const tabs = Array.from({ length: 11 }, (_value, index) => `tab-${index + 1}`);

  assert.deepEqual(segmentTabs(tabs), [tabs.slice(0, 10), tabs.slice(10)]);
});

test("auto-fills complete multi-segment groups as topmost leftmost rectangles", () => {
  const placed = placeBoardCards([
    { boardKey: "auto:one.example", segmentIndex: 0, heightUnits: 2, rank: 1 },
    { boardKey: "auto:one.example", segmentIndex: 1, heightUnits: 1, rank: 1 },
    { boardKey: "auto:two.example", segmentIndex: 0, heightUnits: 1, rank: 2 },
    { boardKey: "auto:three.example", segmentIndex: 0, heightUnits: 1, rank: 3 },
  ], 3, true);

  assert.deepEqual(placed.placements.map((placement) => [placement.boardKey, placement.segmentIndex, placement.lane, placement.slot, placement.compositeHeight]), [
    ["auto:one.example", 0, 0, 0, 2],
    ["auto:one.example", 1, 1, 0, 2],
    ["auto:two.example", 0, 2, 0, 1],
    ["auto:three.example", 0, 2, 1, 1],
  ]);
});

test("reserves the short segment's lower cell in a twenty-one-tab composite", () => {
  const placed = placeBoardCards([
    { boardKey: "auto:a.example", segmentIndex: 0, heightUnits: 2, rank: 1 },
    { boardKey: "auto:a.example", segmentIndex: 1, heightUnits: 2, rank: 1 },
    { boardKey: "auto:a.example", segmentIndex: 2, heightUnits: 1, rank: 1 },
    { boardKey: "auto:b.example", segmentIndex: 0, heightUnits: 1, rank: 2 },
  ], 3, true);

  assert.deepEqual(placed.placements.map((placement) => [placement.boardKey, placement.segmentIndex, placement.lane, placement.slot]), [
    ["auto:a.example", 0, 0, 0],
    ["auto:a.example", 1, 1, 0],
    ["auto:a.example", 2, 2, 0],
    ["auto:b.example", 0, 0, 2],
  ]);
});

test("keeps manual card lane and order for device-specific rendering", () => {
  const placed = placeBoardCards([
    { boardKey: "auto:one.example", segmentIndex: 0, heightUnits: 1, manualLane: 1, manualOrder: 2 },
    { boardKey: "auto:two.example", segmentIndex: 0, heightUnits: 1, manualLane: 0, manualOrder: 1 },
    { boardKey: "auto:three.example", segmentIndex: 0, heightUnits: 2, manualLane: 1, manualOrder: 0 },
  ], 2, false);

  assert.deepEqual(placed.placements.map((placement) => [placement.boardKey, placement.lane, placement.order]), [
    ["auto:one.example", 1, 2],
    ["auto:two.example", 0, 1],
    ["auto:three.example", 1, 0],
  ]);
});

test("keeps an empty manual grid slot when card heights change", () => {
  const placed = placeBoardCards([
    { boardKey: "auto:one.example", segmentIndex: 0, heightUnits: 2, manualLane: 0, manualSlot: 0 },
    { boardKey: "auto:two.example", segmentIndex: 0, heightUnits: 1, manualLane: 0, manualSlot: 3 },
  ], 2, false);

  assert.deepEqual(placed.placements.map((placement) => [placement.boardKey, placement.lane, placement.slot]), [
    ["auto:one.example", 0, 0],
    ["auto:two.example", 0, 3],
  ]);
});

test("spans a fixed manual grid unit for each five-tab card height", () => {
  assert.deepEqual(manualBoardGridRow({ slot: 3, heightUnits: 2 }), { start: 4, span: 2 });
  assert.deepEqual(manualBoardGridRow({ slot: 3, heightUnits: 1 }), { start: 4, span: 1 });
});

test("shifts manual cards by a dragged two-unit span without grid overlap", () => {
  const moved = moveManualBoardCard([
    { boardKey: "auto:source.example", segmentIndex: 0, heightUnits: 2, lane: 0, order: 0, slot: 0 },
    { boardKey: "auto:target.example", segmentIndex: 0, heightUnits: 1, lane: 0, order: 2, slot: 2 },
    { boardKey: "auto:after.example", segmentIndex: 0, heightUnits: 1, lane: 0, order: 3, slot: 3 },
  ], "auto:source.example", "auto:target.example");

  assert.deepEqual(moved?.map((placement) => [placement.boardKey, placement.lane, placement.slot, placement.heightUnits]), [
    ["auto:source.example", 0, 2, 2],
    ["auto:target.example", 0, 4, 1],
    ["auto:after.example", 0, 5, 1],
  ]);
  const intervals = moved?.map((placement) => [placement.slot, placement.slot + placement.heightUnits]).sort((left, right) => left[0] - right[0]);
  assert.ok(intervals?.every((interval, index) => index === 0 || intervals[index - 1][1] <= interval[0]));
});

test("selects manual board slots only from the active device layout", () => {
  const cards = [{ boardKey: "auto:example.com", segmentIndex: 0, heightUnits: 1 }];
  const layouts = [
    { boardKey: "auto:example.com", deviceClass: "desktop", rank: 0, autoFill: false, manualLane: 2, manualSlot: 4 },
    { boardKey: "auto:example.com", deviceClass: "tablet", rank: 0, autoFill: false, manualLane: 1, manualSlot: 1 },
  ];

  assert.deepEqual(boardCardsForDevice(cards, layouts, "desktop"), [{
    boardKey: "auto:example.com", segmentIndex: 0, heightUnits: 1, manualLane: 2, manualSlot: 4,
  }]);
  assert.deepEqual(boardCardsForDevice(cards, layouts, "tablet"), [{
    boardKey: "auto:example.com", segmentIndex: 0, heightUnits: 1, manualLane: 1, manualSlot: 1,
  }]);
});

test("keeps eleven-tab segments in one horizontal manual composite", () => {
  const cards = buildBoardCards([{
    boardKey: "auto:example.com", kind: "automatic", title: "Example", color: "blue", rank: 0,
    tabs: Array.from({ length: 11 }, (_value, index) => ({ id: index + 1, title: `Tab ${index + 1}` })),
  }]);
  const positioned = boardCardsForDevice(cards, [{
    boardKey: "auto:example.com", deviceClass: "desktop", rank: 0, autoFill: false, manualLane: 1, manualSlot: 3,
  }], "desktop");

  const placed = placeBoardCards(positioned, 3, false);
  assert.deepEqual(placed.placements.map((placement) => [placement.segmentIndex, placement.lane, placement.slot, placement.compositeHeight]), [
    [0, 1, 3, 2],
    [1, 2, 3, 2],
  ]);
});

test("moves every segment of a composite together in manual layout", () => {
  const moved = moveManualBoardCard([
    { boardKey: "auto:a.example", segmentIndex: 0, heightUnits: 2, lane: 0, order: 0, slot: 0, compositeHeight: 2 },
    { boardKey: "auto:a.example", segmentIndex: 1, heightUnits: 1, lane: 1, order: 0, slot: 0, compositeHeight: 2 },
    { boardKey: "auto:b.example", segmentIndex: 0, heightUnits: 1, lane: 2, order: 0, slot: 0, compositeHeight: 1 },
  ], "auto:a.example", "auto:b.example", 4);

  assert.deepEqual(moved?.filter((placement) => placement.boardKey === "auto:a.example").map((placement) => [placement.lane, placement.slot]), [
    [2, 0], [3, 0],
  ]);
});

test("clamps a two-wide manual composite dropped on the last of three lanes", () => {
  const moved = moveManualBoardCard([
    { boardKey: "auto:a.example", segmentIndex: 0, heightUnits: 2, lane: 0, order: 0, slot: 0, compositeWidth: 2, compositeHeight: 2 },
    { boardKey: "auto:a.example", segmentIndex: 1, heightUnits: 1, lane: 1, order: 0, slot: 0, compositeWidth: 2, compositeHeight: 2 },
    { boardKey: "auto:b.example", segmentIndex: 0, heightUnits: 1, lane: 2, order: 0, slot: 0, compositeWidth: 1, compositeHeight: 1 },
  ], "auto:a.example", "auto:b.example", 3);

  assert.deepEqual(moved?.filter((placement) => placement.boardKey === "auto:a.example").map((placement) => placement.lane), [1, 2]);
});

test("keeps eleven- and twenty-one-tab composites horizontal at every board width", () => {
  for (const laneCount of [3, 2, 1]) {
    const eleven = placeBoardCards([
      { boardKey: "auto:eleven.example", segmentIndex: 0, heightUnits: 2, rank: 1 },
      { boardKey: "auto:eleven.example", segmentIndex: 1, heightUnits: 1, rank: 1 },
    ], laneCount, true).placements;
    const twentyOne = placeBoardCards([
      { boardKey: "auto:twenty-one.example", segmentIndex: 0, heightUnits: 2, rank: 1 },
      { boardKey: "auto:twenty-one.example", segmentIndex: 1, heightUnits: 2, rank: 1 },
      { boardKey: "auto:twenty-one.example", segmentIndex: 2, heightUnits: 1, rank: 1 },
    ], laneCount, true).placements;

    assert.deepEqual(eleven.map((placement) => [placement.lane, placement.slot]), [[0, 0], [1, 0]]);
    assert.deepEqual(twentyOne.map((placement) => [placement.lane, placement.slot]), [[0, 0], [1, 0], [2, 0]]);
  }
});

test("validates isolated manual board layouts for each device class", () => {
  const desktop = validateBoardLayout({
    boardKey: "custom:7c5e0df8-d6b4-4b10-a820-2d1d1ef9b573",
    deviceClass: "desktop",
    rank: 2,
    autoFill: false,
    manualLane: 1,
    manualSlot: 3,
  });
  const tablet = validateBoardLayout({
    boardKey: "custom:7c5e0df8-d6b4-4b10-a820-2d1d1ef9b573",
    deviceClass: "tablet",
    rank: 2,
    autoFill: false,
    manualLane: 0,
    manualSlot: 1,
  });

  assert.deepEqual(desktop, {
    boardKey: "custom:7c5e0df8-d6b4-4b10-a820-2d1d1ef9b573",
    deviceClass: "desktop",
    rank: 2,
    autoFill: false,
    manualLane: 1,
    manualSlot: 3,
  });
  assert.deepEqual(tablet, {
    boardKey: "custom:7c5e0df8-d6b4-4b10-a820-2d1d1ef9b573",
    deviceClass: "tablet",
    rank: 2,
    autoFill: false,
    manualLane: 0,
    manualSlot: 1,
  });
  assert.notDeepEqual(desktop, tablet);
  assert.equal(validateBoardLayout({ ...desktop, deviceClass: "watch" }), null);
  assert.equal(validateBoardLayout({ ...desktop, manualLane: -1 }), null);
  assert.deepEqual(validateBoardLayout({
    boardKey: "auto:docs.example",
    deviceClass: "mobile",
    rank: 4,
    autoFill: true,
  }), {
    boardKey: "auto:docs.example",
    deviceClass: "mobile",
    rank: 4,
    autoFill: true,
  });
  assert.equal(validateBoardLayout({
    boardKey: "auto:docs.example",
    deviceClass: "mobile",
    rank: 4,
    autoFill: true,
    manualLane: 0,
    manualOrder: 0,
  }), null);
});

test("marks cloud restore failures as retryable without exposing error details", () => {
  assert.deepEqual(syncFailureStatus(new Error("Bearer top-secret-token failed")), {
    state: "error",
    message: "云端同步暂时不可用，请稍后重试。",
  });
});

test("converts complete Supabase settings rows to concrete local settings", () => {
  assert.deepEqual(settingsFromSyncRow({
    user_id: "user-1",
    auto_group_enabled: false,
    minimum_tabs: 4,
    default_group_color: "purple",
    cloud_sync_enabled: false,
    sync_rules_enabled: true,
    sync_ignore_list_enabled: false,
    open_board_on_new_tab: true,
    deferred_shortcut_times: ["14:30", "18:00"],
    theme: "dark",
    language: undefined,
  }), {
    autoGroupEnabled: false,
    minimumTabs: 4,
    defaultGroupColor: "purple",
    cloudSyncEnabled: false,
    syncRulesEnabled: true,
    syncIgnoreListEnabled: false,
    openBoardOnNewTab: true,
    deferredShortcutTimes: ["14:30", "18:00"],
    theme: "dark",
    language: undefined,
  });
});

test("defaults a missing new-tab board setting from older Supabase rows", () => {
  assert.equal(settingsFromSyncRow({
    user_id: "user-1",
    auto_group_enabled: true,
    minimum_tabs: 2,
  })?.openBoardOnNewTab, false);
});

test("defaults a missing deferred-shortcut-times setting from older Supabase rows", () => {
  assert.deepEqual(settingsFromSyncRow({
    user_id: "user-1",
    auto_group_enabled: true,
    minimum_tabs: 2,
  })?.deferredShortcutTimes, ["09:00", "14:00", "18:00"]);
});

test("rejects Supabase rows with invalid deferred shortcut times", () => {
  assert.equal(settingsFromSyncRow({
    user_id: "user-1",
    auto_group_enabled: true,
    minimum_tabs: 2,
    deferred_shortcut_times: ["25:00"],
  }), null);
  assert.equal(settingsFromSyncRow({
    user_id: "user-1",
    auto_group_enabled: true,
    minimum_tabs: 2,
    deferred_shortcut_times: ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00"],
  }), null);
});

test("includes deferred shortcut times in sync payloads", () => {
  assert.deepEqual(settingsSyncRow("user-1", {
    autoGroupEnabled: true,
    minimumTabs: 2,
    openBoardOnNewTab: false,
    deferredShortcutTimes: ["05:00", "15:00", "23:30"],
  }).deferred_shortcut_times, ["05:00", "15:00", "23:30"]);
});

test("validates the new-tab board setting in options payloads", () => {
  const settings = {
    autoGroupEnabled: true,
    minimumTabs: 2,
    defaultGroupColor: "blue",
    cloudSyncEnabled: true,
    syncRulesEnabled: true,
    syncIgnoreListEnabled: true,
    openBoardOnNewTab: true,
  };
  const { openBoardOnNewTab: _openBoardOnNewTab, ...legacySettings } = settings;

  assert.equal(validateOptionsSettings(settings)?.openBoardOnNewTab, true);
  assert.equal(validateOptionsSettings(legacySettings)?.openBoardOnNewTab, false);
  assert.equal(validateOptionsSettings({ ...settings, openBoardOnNewTab: "true" }), null);
});

test("includes the new-tab board setting and theme in sync payloads", () => {
  assert.deepEqual(settingsSyncRow("user-1", {
    autoGroupEnabled: true,
    minimumTabs: 2,
    openBoardOnNewTab: true,
    theme: "dark",
    language: undefined,
  }), {
    user_id: "user-1",
    auto_group_enabled: true,
    minimum_tabs: 2,
    open_board_on_new_tab: true,
    default_group_color: undefined,
    cloud_sync_enabled: undefined,
    sync_rules_enabled: undefined,
    sync_ignore_list_enabled: undefined,
    deferred_shortcut_times: undefined,
    theme: "dark",
    language: undefined,
  });
});

test("rejects malformed Supabase group-rule colors and match scopes", () => {
  const row = {
    id: "rule-1",
    user_id: "user-1",
    title: "Example",
    color: "blue",
    domains: ["example.com"],
    match_scope: "exact",
    enabled: true,
    sort_order: 0,
  };

  assert.equal(groupRuleFromSyncRow({ ...row, color: "teal" }), null);
  assert.equal(groupRuleFromSyncRow({ ...row, match_scope: "everywhere" }), null);
  assert.equal(ignoredSiteFromSyncRow({
    id: "site-1",
    user_id: "user-1",
    domain: "example.com",
    match_scope: "everywhere",
    sort_order: 0,
  }), null);
});

test("preserves an existing rule sort order when editing the UI DTO", () => {
  const existing = {
    id: "rule-1",
    title: "Before",
    color: "blue",
    domains: ["example.com"],
    matchScope: "exact",
    enabled: true,
    sortOrder: 7,
  };

  assert.deepEqual(updateGroupRuleFromInput({
    id: "rule-1",
    title: "After",
    color: "green",
    domains: ["docs.example.com"],
    matchScope: "domain-and-subdomains",
    enabled: false,
  }, existing), {
    ...existing,
    title: "After",
    color: "green",
    domains: ["docs.example.com"],
    matchScope: "domain-and-subdomains",
    enabled: false,
  });
});

test("uses existing cloud category data instead of stale local data", () => {
  const local = [{ id: "local", title: "Stale", color: "blue", domains: ["local.example.com"], matchScope: "exact", enabled: true, sortOrder: 0 }];
  const remote = [{ id: "remote", title: "Current", color: "green", domains: ["remote.example.com"], matchScope: "exact", enabled: true, sortOrder: 0 }];

  assert.deepEqual(resolveCloudCollection(local, remote), {
    local: remote,
    initializeRemote: false,
  });
});

test("initializes an absent cloud category from local data without clearing local data", () => {
  const local = [{ id: "local", domain: "local.example.com", matchScope: "exact", sortOrder: 0 }];

  assert.deepEqual(resolveCloudCollection(local, []), {
    local,
    initializeRemote: true,
  });
});

test("rejects Supabase rows returned for a different user", () => {
  const settingsRow = {
    user_id: "other-user",
    auto_group_enabled: true,
    minimum_tabs: 2,
    default_group_color: "blue",
    cloud_sync_enabled: true,
    sync_rules_enabled: true,
    sync_ignore_list_enabled: true,
  };
  const groupRuleRow = {
    id: "rule-1",
    user_id: "other-user",
    title: "Example",
    color: "blue",
    domains: ["example.com"],
    match_scope: "exact",
    enabled: true,
    sort_order: 0,
  };
  const ignoredSiteRow = {
    id: "site-1",
    user_id: "other-user",
    domain: "example.com",
    match_scope: "exact",
    sort_order: 0,
  };

  assert.equal(settingsFromSyncRow(settingsRow, "expected-user"), null);
  assert.equal(groupRuleFromSyncRow(groupRuleRow, "expected-user"), null);
  assert.equal(ignoredSiteFromSyncRow(ignoredSiteRow, "expected-user"), null);
});

test("normalizes hostnames and strips www", () => {
  assert.equal(normalizeHostname("WWW.Example.COM."), "example.com");
});

test("classifies only web URLs", () => {
  assert.equal(getSiteKey("https://www.Example.com/a?q=1"), "example.com");
  assert.equal(getSiteKey("http://docs.example.com/b"), "docs.example.com");
  assert.equal(getSiteKey("chrome://settings"), null);
  assert.equal(getSiteKey("not a url"), null);
});

test("builds readable site titles", () => {
  assert.equal(siteTitle("github.com"), "Github");
});

test("normalizes domain inputs from hostnames and web URLs", () => {
  assert.equal(normalizeDomainInput("WWW.Example.COM."), "example.com");
  assert.equal(normalizeDomainInput("https://www.example.com/path?q=1"), "example.com");
  assert.equal(normalizeDomainInput("chrome://settings"), null);
  assert.equal(normalizeDomainInput("not a domain"), null);
});

test("matches exact and domain-and-subdomains scopes", () => {
  assert.equal(matchesDomain("docs.example.com", "example.com", "exact"), false);
  assert.equal(matchesDomain("docs.example.com", "example.com", "domain-and-subdomains"), true);
  assert.equal(matchesDomain("notexample.com", "example.com", "domain-and-subdomains"), false);
});

test("selects an exact rule before an earlier subdomain rule", () => {
  const rules = [
    {
      id: "subdomain-rule",
      title: "Example sites",
      color: "blue",
      domains: ["example.com"],
      matchScope: "domain-and-subdomains",
      enabled: true,
      sortOrder: 0,
    },
    {
      id: "exact-rule",
      title: "Documentation",
      color: "green",
      domains: ["docs.example.com"],
      matchScope: "exact",
      enabled: true,
      sortOrder: 99,
    },
  ];

  assert.equal(findMatchingRule("docs.example.com", rules)?.id, "exact-rule");
});

test("an ignored site wins over an otherwise matching rule", () => {
  const ignoredSites = [{ id: "ignore-docs", domain: "docs.example.com", matchScope: "exact", sortOrder: 0 }];
  const rules = [{
    id: "docs-rule",
    title: "Documentation",
    color: "blue",
    domains: ["docs.example.com"],
    matchScope: "exact",
    enabled: true,
    sortOrder: 0,
  }];

  assert.equal(isIgnoredSite("docs.example.com", ignoredSites), true);
  assert.equal(isIgnoredSite("docs.example.com", ignoredSites) ? undefined : findMatchingRule("docs.example.com", rules), undefined);
});

test("resolves ignored sites before matching rules", () => {
  const settings = { autoGroupEnabled: true, minimumTabs: 2, defaultGroupColor: "purple" };
  const rules = [{ id: "docs-rule", title: "Documentation", color: "blue", domains: ["docs.example.com"], matchScope: "exact", enabled: true, sortOrder: 0 }];
  const ignoredSites = [{ id: "ignore-docs", domain: "docs.example.com", matchScope: "exact", sortOrder: 0 }];

  assert.deepEqual(resolveAutoGroup("docs.example.com", settings, rules, ignoredSites), { kind: "ignore" });
});

test("resolves a matching rule's title and color", () => {
  const settings = { autoGroupEnabled: true, minimumTabs: 2, defaultGroupColor: "purple" };
  const rules = [{ id: "docs-rule", title: "Documentation", color: "green", domains: ["example.com"], matchScope: "domain-and-subdomains", enabled: true, sortOrder: 0 }];

  assert.deepEqual(resolveAutoGroup("docs.example.com", settings, rules, []), {
    kind: "group",
    siteKey: "docs.example.com",
    title: "Documentation",
    color: "green",
  });
});

test("resolves unmatched sites with the default title and color", () => {
  const settings = { autoGroupEnabled: true, minimumTabs: 2, defaultGroupColor: "purple" };

  assert.deepEqual(resolveAutoGroup("github.com", settings, [], []), {
    kind: "group",
    siteKey: "github.com",
    title: "Github",
    color: "purple",
  });
});

test("parses only valid portable data and rejects sensitive unknown keys", () => {
  const valid = {
    version: 1,
    settings: {
      autoGroupEnabled: true,
      minimumTabs: 2,
      defaultGroupColor: "blue",
      cloudSyncEnabled: true,
      syncRulesEnabled: true,
      syncIgnoreListEnabled: true,
      lastSuccessfulSyncAt: null,
    },
    groupRules: [{
      id: "rule-1",
      title: "Example",
      color: "blue",
      domains: ["example.com"],
      matchScope: "domain-and-subdomains",
      enabled: true,
      sortOrder: 0,
    }],
    ignoredSites: [{ id: "ignore-1", domain: "ads.example.com", matchScope: "exact", sortOrder: 0 }],
  };

  assert.deepEqual(parsePortableData(valid), {
    ...valid,
    settings: { ...valid.settings, openBoardOnNewTab: false, theme: "light", language: undefined },
  });
  assert.equal(parsePortableData({ ...valid, settings: { ...valid.settings, minimumTabs: 0 } }), null);
  assert.equal(parsePortableData({ ...valid, accessToken: "secret" }), null);
  assert.equal(parsePortableData({ ...valid, groupRules: [{ ...valid.groupRules[0], color: "teal" }] }), null);
  assert.equal(parsePortableData({ ...valid, groupRules: [{ ...valid.groupRules[0], domains: ["example.com", "example.com"] }] }), null);
});

test("preserves and defaults the new-tab board setting and theme in portable data", () => {
  const current = {
    version: 1,
    settings: {
      autoGroupEnabled: true,
      minimumTabs: 2,
      defaultGroupColor: "blue",
      cloudSyncEnabled: true,
      syncRulesEnabled: true,
      syncIgnoreListEnabled: true,
      lastSuccessfulSyncAt: null,
      openBoardOnNewTab: true,
      theme: "dark",
    },
    groupRules: [],
    ignoredSites: [],
  };
  const legacy = structuredClone(current);
  delete legacy.settings.openBoardOnNewTab;
  delete legacy.settings.theme;

  assert.equal(parsePortableData(current)?.settings.openBoardOnNewTab, true);
  assert.equal(parsePortableData(legacy)?.settings.openBoardOnNewTab, false);
  assert.equal(parsePortableData({ ...current, settings: { ...current.settings, openBoardOnNewTab: "true" } }), null);
  assert.equal(parsePortableData(current)?.settings.theme, "dark");
  assert.equal(parsePortableData(legacy)?.settings.theme, "light");
  assert.equal(parsePortableData({ ...current, settings: { ...current.settings, theme: "invalid" } }), null);
});

test("rejects portable data whose required fields are inherited", () => {
  const valid = {
    version: 1,
    settings: {
      autoGroupEnabled: true,
      minimumTabs: 2,
      defaultGroupColor: "blue",
      cloudSyncEnabled: true,
      syncRulesEnabled: true,
      syncIgnoreListEnabled: true,
      lastSuccessfulSyncAt: null,
    },
    groupRules: [],
    ignoredSites: [],
  };

  assert.equal(parsePortableData(Object.create(valid)), null);
});

test("maps portable data explicitly without runtime-only fields", () => {
  const portable = toPortableData(
    {
      autoGroupEnabled: false,
      minimumTabs: 3,
      defaultGroupColor: "purple",
      cloudSyncEnabled: false,
      syncRulesEnabled: true,
      syncIgnoreListEnabled: false,
      lastSuccessfulSyncAt: "2026-07-22T00:00:00.000Z",
      openBoardOnNewTab: false,
      theme: "light",
    },
    [{ id: "rule-1", title: "Example", color: "blue", domains: ["example.com"], matchScope: "exact", enabled: true, sortOrder: 1, accessToken: "secret" }],
    [{ id: "ignore-1", domain: "ads.example.com", matchScope: "exact", sortOrder: 1, accessToken: "secret" }],
  );

  assert.deepEqual(portable, {
    version: 1,
    settings: {
      autoGroupEnabled: false,
      minimumTabs: 3,
      defaultGroupColor: "purple",
      cloudSyncEnabled: false,
      syncRulesEnabled: true,
      syncIgnoreListEnabled: false,
      lastSuccessfulSyncAt: "2026-07-22T00:00:00.000Z",
      openBoardOnNewTab: false,
      theme: "light",
      language: undefined,
    },
    groupRules: [{ id: "rule-1", title: "Example", color: "blue", domains: ["example.com"], matchScope: "exact", enabled: true, sortOrder: 1 }],
    ignoredSites: [{ id: "ignore-1", domain: "ads.example.com", matchScope: "exact", sortOrder: 1 }],
  });
});

test("converts stored state without runtime group mappings", () => {
  const portable = toPortableDataFromState({
    settings: {
      autoGroupEnabled: true,
      minimumTabs: 2,
    },
    groupRules: [{
      id: "rule-1",
      title: "Example",
      color: "blue",
      domains: ["example.com"],
      matchScope: "exact",
      enabled: true,
      sortOrder: 0,
    }],
    ignoredSites: [{ id: "ignore-1", domain: "ads.example.com", matchScope: "exact", sortOrder: 0 }],
    boardAssignments: { "7:12": { windowId: 7, tabId: 12, boardKey: "auto:example.com", order: 0 } },
  });

  assert.deepEqual(portable, {
    version: 1,
    settings: {
      autoGroupEnabled: true,
      minimumTabs: 2,
      defaultGroupColor: "blue",
      cloudSyncEnabled: true,
      syncRulesEnabled: true,
      syncIgnoreListEnabled: true,
      lastSuccessfulSyncAt: null,
      openBoardOnNewTab: false,
      theme: "light",
      language: undefined,
    },
    groupRules: [{
      id: "rule-1",
      title: "Example",
      color: "blue",
      domains: ["example.com"],
      matchScope: "exact",
      enabled: true,
      sortOrder: 0,
    }],
    ignoredSites: [{ id: "ignore-1", domain: "ads.example.com", matchScope: "exact", sortOrder: 0 }],
  });
});

test("keeps stored state unchanged for invalid or unconfirmed imports", () => {
  const state = {
    settings: { autoGroupEnabled: true, minimumTabs: 2 },
    groupRules: [],
    ignoredSites: [],
    boardAssignments: { "7:12": { windowId: 7, tabId: 12, boardKey: "auto:example.com", order: 0 } },
  };
  const before = structuredClone(state);
  const valid = {
    version: 1,
    settings: {
      autoGroupEnabled: false,
      minimumTabs: 4,
      defaultGroupColor: "purple",
      cloudSyncEnabled: true,
      syncRulesEnabled: true,
      syncIgnoreListEnabled: true,
      lastSuccessfulSyncAt: null,
    },
    groupRules: [],
    ignoredSites: [],
  };

  assert.equal(previewPortableImport({ ...valid, settings: { ...valid.settings, minimumTabs: 0 } }), null);
  const preview = previewPortableImport(valid);
  assert.ok(preview);
  assert.ok(previewPortableImport(JSON.stringify(valid)));
  assert.equal(applyPortableImport(state, preview, false), state);
  assert.deepEqual(state, before);
});

test("exports a detached portable snapshot without runtime fields", () => {
  const rules = [{ id: "rule-1", title: "Example", color: "blue", domains: ["example.com"], matchScope: "exact", enabled: true, sortOrder: 0, accessToken: "secret" }];
  const exported = toPortableData({ autoGroupEnabled: true, minimumTabs: 2 }, rules, []);

  exported.groupRules[0].domains[0] = "changed.example.com";
  assert.equal(rules[0].domains[0], "example.com");
  assert.equal("accessToken" in exported.groupRules[0], false);
});

test("clears durable options when their owner differs from the signed-in user", () => {
  const state = {
    settings: { autoGroupEnabled: false, minimumTabs: 6, defaultGroupColor: "purple" },
    groupRules: [{ id: "rule-a", title: "Account A", color: "blue", domains: ["a.example.com"], matchScope: "exact", enabled: true, sortOrder: 0 }],
    ignoredSites: [{ id: "ignore-a", domain: "ads.example.com", matchScope: "exact", sortOrder: 0 }],
    boardAssignments: { "7:12": { windowId: 7, tabId: 12, boardKey: "auto:a.example.com", order: 0 } },
  };

  const switched = resetOptionsForUser(state, "account-a", "account-b");
  assert.equal(switched.changed, true);
  assert.deepEqual(switched.state.groupRules, []);
  assert.deepEqual(switched.state.ignoredSites, []);
  assert.equal(switched.state.settings.minimumTabs, 2);
  assert.deepEqual(switched.state.boardAssignments, state.boardAssignments);
  assert.equal(resetOptionsForUser(state, "account-a", "account-a").changed, false);
});

test("prepares persisted options for the authenticated account before reading them", async () => {
  const values = {
    optionsUserId: "account-a",
    settings: { autoGroupEnabled: false, minimumTabs: 6, defaultGroupColor: "purple" },
    groupRules: [{ id: "rule-a", title: "Account A", color: "blue", domains: ["a.example.com"], matchScope: "exact", enabled: true, sortOrder: 0 }],
    ignoredSites: [{ id: "ignore-a", domain: "ads.example.com", matchScope: "exact", sortOrder: 0 }],
  };
  globalThis.chrome.storage = {
    local: {
      get: async (keys) => {
        const requested = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(requested.flatMap((key) => key in values ? [[key, values[key]]] : []));
      },
      set: async (next) => Object.assign(values, next),
      remove: async (keys) => {
        const requested = Array.isArray(keys) ? keys : [keys];
        for (const key of requested) delete values[key];
      },
    },
  };
  const { prepareOptionsForUser } = await import("../dist/storage.js");

  const prepared = await prepareOptionsForUser("account-b");

  assert.deepEqual(prepared.groupRules, []);
  assert.deepEqual(prepared.ignoredSites, []);
  assert.equal(values.optionsUserId, "account-b");
});

test("only confirms an import preview for its original signed-in user", () => {
  assert.equal(canConfirmOptionsImport("account-a", "account-a"), true);
  assert.equal(canConfirmOptionsImport("account-a", "account-b"), false);
  assert.equal(canConfirmOptionsImport("account-a", null), false);
});

test("clearUserData removes per-user keys but preserves device-level keys", async () => {
  const values = {
    optionsUserId: "account-a",
    deferredTabs: [{ id: "d1", title: "Old", url: "https://old.com", deferredAt: "2026-07-30T00:00:00.000Z", dueAt: "2026-07-31T00:00:00.000Z" }],
    recentlyClosedTabs: [{ id: "r1", title: "Closed", url: "https://closed.com", closedAt: "2026-07-30T00:00:00.000Z" }],
    workspaceSnapshots: [{ id: "w1", title: "WS", tabs: [], createdAt: "2026-07-30T00:00:00.000Z" }],
    workspaceHistories: { w1: { workspaceId: "w1", versions: [] } },
    boardAssignments: { "1:2": { boardKey: "auto:x", windowId: 1, tabId: 2 } },
    tabCreatedAt: { 1: 1000, 2: 2000 },
    board_collapsed_groups: ["auto:x"],
    deviceId: "device-abc",
    deviceName: "Mac-Chrome",
  };
  globalThis.chrome.storage = {
    local: {
      get: async (keys) => {
        const requested = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(requested.flatMap((key) => key in values ? [[key, values[key]]] : []));
      },
      set: async (next) => Object.assign(values, next),
      remove: async (keys) => {
        const requested = Array.isArray(keys) ? keys : [keys];
        for (const key of requested) delete values[key];
      },
    },
  };
  const { clearUserData } = await import("../dist/storage.js");

  await clearUserData();

  // Per-user data must be gone
  assert.equal(values.deferredTabs, undefined);
  assert.equal(values.recentlyClosedTabs, undefined);
  assert.equal(values.workspaceSnapshots, undefined);
  assert.equal(values.workspaceHistories, undefined);
  assert.equal(values.boardAssignments, undefined);
  assert.equal(values.tabCreatedAt, undefined);
  assert.equal(values.board_collapsed_groups, undefined);
  // Device-level keys must survive
  assert.equal(values.deviceId, "device-abc");
  assert.equal(values.deviceName, "Mac-Chrome");
});

test("prepareOptionsForUser clears per-user data when switching accounts", async () => {
  const values = {
    optionsUserId: "account-a",
    settings: { autoGroupEnabled: false, minimumTabs: 6, defaultGroupColor: "purple" },
    groupRules: [],
    ignoredSites: [],
    boardCustomGroups: [],
    boardLayouts: [],
    deferredTabs: [{ id: "d1", title: "Old", url: "https://old.com", deferredAt: "2026-07-30T00:00:00.000Z", dueAt: "2026-07-31T00:00:00.000Z" }],
    recentlyClosedTabs: [{ id: "r1", title: "Closed", url: "https://closed.com", closedAt: "2026-07-30T00:00:00.000Z" }],
    workspaceSnapshots: [],
    workspaceHistories: {},
    boardAssignments: {},
    tabCreatedAt: {},
    board_collapsed_groups: ["auto:x"],
  };
  globalThis.chrome.storage = {
    local: {
      get: async (keys) => {
        const requested = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(requested.flatMap((key) => key in values ? [[key, values[key]]] : []));
      },
      set: async (next) => Object.assign(values, next),
      remove: async (keys) => {
        const requested = Array.isArray(keys) ? keys : [keys];
        for (const key of requested) delete values[key];
      },
    },
  };
  const { prepareOptionsForUser } = await import("../dist/storage.js");

  await prepareOptionsForUser("account-b");

  // Per-user data must be cleared after account switch
  assert.equal(values.deferredTabs, undefined);
  assert.equal(values.recentlyClosedTabs, undefined);
  assert.equal(values.board_collapsed_groups, undefined);
  // Options must be reset for the new user
  assert.equal(values.optionsUserId, "account-b");
});

test("matchesTimelineFilter returns true for 'all' range regardless of date", async () => {
  const { matchesTimelineFilter } = await import("../dist/shared.js");
  const now = Date.now();
  assert.equal(matchesTimelineFilter(now, "all"), true);
  assert.equal(matchesTimelineFilter(now - 86_400_000 * 30, "all"), true);
  assert.equal(matchesTimelineFilter(0, "all"), true);
});

test("matchesTimelineFilter filters by today (less than 1 day ago)", async () => {
  const { matchesTimelineFilter } = await import("../dist/shared.js");
  const now = Date.now();
  assert.equal(matchesTimelineFilter(now, "today"), true);
  assert.equal(matchesTimelineFilter(now - 3600_000, "today"), true);
  assert.equal(matchesTimelineFilter(now - 86_400_000, "today"), false);
  assert.equal(matchesTimelineFilter(now - 86_400_000 * 3, "today"), false);
});

test("matchesTimelineFilter filters by 3 days", async () => {
  const { matchesTimelineFilter } = await import("../dist/shared.js");
  const now = Date.now();
  assert.equal(matchesTimelineFilter(now, "3days"), true);
  assert.equal(matchesTimelineFilter(now - 86_400_000 * 2, "3days"), true);
  assert.equal(matchesTimelineFilter(now - 86_400_000 * 3, "3days"), false);
  assert.equal(matchesTimelineFilter(now - 86_400_000 * 7, "3days"), false);
});

test("matchesTimelineFilter filters by 7 days", async () => {
  const { matchesTimelineFilter } = await import("../dist/shared.js");
  const now = Date.now();
  assert.equal(matchesTimelineFilter(now, "7days"), true);
  assert.equal(matchesTimelineFilter(now - 86_400_000 * 6, "7days"), true);
  assert.equal(matchesTimelineFilter(now - 86_400_000 * 7, "7days"), false);
  assert.equal(matchesTimelineFilter(now - 86_400_000 * 30, "7days"), false);
});

test("matchesTimelineFilter always returns true when refDate is 0", async () => {
  const { matchesTimelineFilter } = await import("../dist/shared.js");
  assert.equal(matchesTimelineFilter(0, "today"), true);
  assert.equal(matchesTimelineFilter(0, "3days"), true);
  assert.equal(matchesTimelineFilter(0, "7days"), true);
});
