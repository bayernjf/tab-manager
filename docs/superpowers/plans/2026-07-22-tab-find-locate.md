# Tab Find and Locate Implementation Plan

> **Status:** ✅ 已实现（v0.1.11）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users search the all-window board, filter results by source window, and identify where each visible tab lives.

**Architecture:** Add pure board-search helpers in `shared.ts` so matching and source-window labels are independently testable. The background returns each eligible board tab's `windowId` and a stable window display label; `board.ts` owns filter controls and render-time filtering without changing browser tabs.

**Tech Stack:** TypeScript strict mode, Chrome MV3 tabs/windows APIs, native DOM, Node.js test runner.

---

### Task 1: Define and test pure search behavior

**Files:**
- Modify: `src/shared.ts`
- Test: `tests/shared.test.js`

- [ ] **Step 1: Write failing tests**

```js
assert.equal(boardTabMatchesQuery({ id: 1, title: "GitHub PR", url: "https://github.com/org/repo", windowId: 2 }, "github"), true);
assert.equal(boardTabMatchesQuery({ id: 1, title: "GitHub PR", url: "https://github.com/org/repo", windowId: 2 }, "org/repo"), true);
assert.equal(boardTabMatchesQuery({ id: 1, title: "GitHub PR", url: "https://github.com/org/repo", windowId: 2 }, "calendar"), false);
```

- [ ] **Step 2: Verify red**

Run: `npm test`

Expected: FAIL because `boardTabMatchesQuery` is not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
export function boardTabMatchesQuery(tab: BoardTab, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [tab.title, tab.url ?? "", getSiteKey(tab.url) ?? ""].some((value) => value.toLocaleLowerCase().includes(needle));
}
```

- [ ] **Step 4: Verify green**

Run: `npm test`

Expected: PASS.

### Task 2: Carry source-window metadata into board state

**Files:**
- Modify: `src/shared.ts`
- Modify: `src/background.ts`
- Test: `tests/shared.test.js`

- [ ] **Step 1: Write failing tests**

```js
assert.equal(boardWindowLabel(3), "窗口 3");
assert.equal(boardWindowLabel(0), null);
```

- [ ] **Step 2: Verify red**

Run: `npm test`

Expected: FAIL because `boardWindowLabel` is not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
export function boardWindowLabel(windowId: number): string | null {
  return Number.isInteger(windowId) && windowId > 0 ? `窗口 ${windowId}` : null;
}
```

Map eligible Chrome tabs with their `windowId`; the board continues using the existing runtime-only identifier and does not persist it.

- [ ] **Step 4: Verify green**

Run: `npm test`

Expected: PASS.

### Task 3: Render search and source-window controls

**Files:**
- Modify: `src/board.html`
- Modify: `src/board.ts`
- Modify: `src/board.css`
- Test: `tests/shared.test.js`

- [ ] **Step 1: Write failing test**

```js
assert.match(boardHtml, /id="board-search"/);
assert.match(boardHtml, /id="window-filter"/);
assert.match(boardScript, /boardTabMatchesQuery/);
assert.match(boardCss, /\.tab-window/);
```

- [ ] **Step 2: Verify red**

Run: `npm test`

Expected: FAIL because the search controls and source-window label are absent.

- [ ] **Step 3: Write minimal implementation**

Add an accessible text search input and a source-window select in the board header. Re-render on input/change; preserve all groups and render a compact no-match message in groups with no filtered tabs. Append a source-window label to each matching tab row.

- [ ] **Step 4: Verify green**

Run: `npm test`

Expected: PASS.

### Task 4: Verify the completed phase

**Files:**
- Modify: `tests/shared.test.js`

- [ ] **Step 1: Run complete validation**

Run: `npm test && npm run typecheck && git diff --check`

Expected: all tests pass, strict type checking passes, and no whitespace errors are reported.

- [ ] **Step 2: Manual browser verification**

Load the rebuilt extension, open the board with tabs in two normal windows, verify title/URL/domain search, source-window filtering, source labels, and click-to-activate behavior.
