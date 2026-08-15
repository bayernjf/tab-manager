# Board Statistics Implementation Plan

> **Status:** ✅ 已实现（v0.1.11）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show non-destructive board cleanup statistics using only existing extension permissions.

**Architecture:** The MV3 worker counts eligible tabs and exact URL duplicate candidates across normal windows, reads due deferred records from local storage, and returns a small stats DTO. The board renders advisory metric cards; no action closes, archives, or changes a tab.

**Tech Stack:** Native TypeScript, Chrome MV3 tabs/storage APIs, DOM APIs, CSS, Node.js test runner.

---

### Task 1: Add a read-only statistics message

**Files:** `src/background.ts`, `tests/shared.test.js`

- [ ] Write a failing built-worker contract test for `get-board-statistics` and duplicate grouping; run `npm test` to red.
- [ ] Require a signed-in user, count eligible board tabs across normal windows, count duplicate extras as each duplicate group length minus one, and count due local deferred records. Return `{ eligibleTabCount, duplicateTabCount, dueDeferredCount }`. Run `npm test` and `npm run typecheck` to green.

### Task 2: Render advisory cards in the board

**Files:** `src/board.html`, `src/board.ts`, `src/board.css`, `tests/shared.test.js`

- [ ] Write a failing UI contract test for `#board-statistics`, a statistics message request, and `.board-statistics`; run `npm test` to red.
- [ ] Render three compact cards: “网页标签”, “重复页面”, and “待恢复提醒”, with a note that statistics are advisory. Load them with board state and refresh. Run `npm test` to green.

### Task 3: Verify

- [ ] Run `npm test && npm run typecheck && git diff --check`.
- [ ] Manually verify multiple windows and due reminders yield expected counts. Do not add `history` permission; long-unvisited suggestions remain unavailable until explicitly approved.

No commit is included because the user has not requested a commit.
