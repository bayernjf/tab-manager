# Duplicate Tab Review Implementation Plan

> **Status:** ✅ 已实现（v0.1.11）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user review exact duplicate browser tabs and explicitly close only the reviewed extras.

**Architecture:** Keep URL normalization and duplicate grouping as pure functions in `src/shared.ts`. The board requests a runtime preview from the MV3 service worker, renders it in a local review dialog, and sends the reviewed groups back only after confirmation; the worker revalidates live tabs before every close operation.

**Tech Stack:** Native TypeScript, Chrome MV3 tabs API, HTML dialog, CSS, Node.js test runner.

---

### Task 1: Build pure duplicate URL grouping

**Files:**
- Modify: `src/shared.ts`
- Modify: `tests/shared.test.js`

- [x] **Step 1: Write the failing tests**

```js
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
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test`

Expected: FAIL because `findDuplicateBoardTabs` is not exported.

- [x] **Step 3: Write minimal implementation**

```ts
export interface DuplicateBoardTabGroup {
  url: string;
  retainedTabId: number;
  tabs: BoardTab[];
}

export function findDuplicateBoardTabs(tabs: readonly BoardTab[]): DuplicateBoardTabGroup[] {
  // Parse with new URL, retain only http(s), use URL.href as the canonical key,
  // then emit groups with two or more tabs in first-seen order.
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npm test`

Expected: all tests pass.

### Task 2: Add preview and stale-safe confirmation messages

**Files:**
- Modify: `src/background.ts`
- Modify: `tests/shared.test.js`

- [x] **Step 1: Write the failing built-worker contract test**

```js
test("builds duplicate preview and explicit batch-close handlers", async () => {
  const background = await readFile(new URL("../dist/background.js", import.meta.url), "utf8");

  assert.match(background, /message\.type === "get-board-duplicate-preview"/);
  assert.match(background, /findDuplicateBoardTabs/);
  assert.match(background, /message\.type === "close-board-duplicates"/);
  assert.match(background, /message\.confirmed !== true/);
  assert.match(background, /chrome\.tabs\.remove/);
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test`

Expected: FAIL because the worker has neither message handler.

- [x] **Step 3: Write minimal worker implementation**

```ts
| { type: "get-board-duplicate-preview" }
| { type: "close-board-duplicates"; groups: unknown; confirmed?: boolean }
```

The preview handler requires an authenticated user, enumerates normal windows with populated tabs, maps eligible tabs with `boardTab`, and returns `findDuplicateBoardTabs(tabs)`. The close handler requires `confirmed === true`, validates each supplied group as `{ retainedTabId: positive integer, tabIds: positive integer[] }`, reloads the listed tabs with `chrome.tabs.get`, and groups only currently matching normalized URLs. For each live group of at least two tabs, keep the original retained tab when available or the first remaining tab; close the remaining listed tabs. Catch missing-tab errors per tab, return `{ closed, skipped }`, and do not close a tab that no longer shares a duplicate URL.

- [x] **Step 4: Run the test to verify it passes**

Run: `npm test`

Expected: all tests pass.

### Task 3: Render the review dialog and confirmation flow

**Files:**
- Modify: `src/board.html`
- Modify: `src/board.ts`
- Modify: `src/board.css`
- Modify: `tests/shared.test.js`

- [x] **Step 1: Write the failing UI contract test**

```js
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
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test`

Expected: FAIL because no duplicate-review controls exist.

- [x] **Step 3: Write minimal UI implementation**

Add `#review-duplicates` beside Refresh and a closed native `dialog#duplicate-review-dialog`. On click, fetch and render each candidate set with a `保留` row and proposed `关闭` rows, or show `没有发现重复标签`. Display a confirm button containing the close count and a cancel button. The confirm action sends only rendered `{ retainedTabId, tabIds }` groups with `confirmed: true`, displays the returned closed/skipped count, closes the dialog, and reloads board state. Disable confirmation while its request is in flight.

- [x] **Step 4: Run the test to verify it passes**

Run: `npm test`

Expected: all tests pass.

### Task 4: Verify the complete duplicate-review feature

**Files:**
- Verify: `src/shared.ts`
- Verify: `src/background.ts`
- Verify: `src/board.html`
- Verify: `src/board.ts`
- Verify: `src/board.css`

- [x] **Step 1: Run static checks**

Run: `npm test && npm run typecheck && git diff --check`

Expected: all commands pass.

- [ ] **Step 2: Manually verify in Chrome**

Reload the unpacked extension, open two normal windows with duplicate and non-duplicate HTTP(S) pages, open the board, choose `检查重复`, confirm that each candidate group shows a retained tab and only same-URL extras, then confirm closure. Re-open review and verify the closed tabs are absent; close one candidate before confirmation and verify confirmation reports it as skipped without closing unrelated tabs.

No commit is included because the user has not requested a commit.
