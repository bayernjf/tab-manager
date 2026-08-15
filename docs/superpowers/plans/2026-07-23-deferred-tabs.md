# Deferred Tabs Implementation Plan

> **Status:** ✅ 已实现（v0.1.11）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users defer a board tab locally, close it only after the reminder is saved, and see due items only inside the board.

**Architecture:** Keep deferred-record validation and due-state calculation pure in `shared.ts`; persist records in their own local-storage key, never in Supabase. The background worker validates each mutation and owns the close/open operations; the board adds a dedicated due-reminder section and a small schedule picker.

**Tech Stack:** Native TypeScript, Chrome MV3 tabs/storage APIs, DOM APIs, CSS, Node.js test runner.

---

### Task 1: Model deferred records and due state

**Files:** `src/shared.ts`, `tests/shared.test.js`

- [ ] Add a failing test for a valid HTTP(S) deferred record and a due calculation at an injected timestamp; run `npm test` and observe failure.
- [ ] Add `DeferredTab` with local-only `id`, `title`, `url`, optional `favIconUrl`, `dueAt`, and `createdAt`; add `validateDeferredTab` and `isDeferredTabDue`. Reject internal URLs and invalid timestamps. Run `npm test` to green.

### Task 2: Save and mutate local reminders in the worker

**Files:** `src/storage.ts`, `src/background.ts`, `tests/shared.test.js`

- [ ] Add a failing built-worker contract test for `defer-board-tab`, `get-deferred-tabs`, `open-deferred-tab`, `reschedule-deferred-tab`, and `delete-deferred-tab`; run `npm test` to red.
- [ ] Add `loadDeferredTabs`/`saveDeferredTabs` for a dedicated local key. On defer, validate a future due time, read the live HTTP(S) tab, save its record first, then close it. On open, create it in the requested normal window without auto-opening due items. On reschedule/delete, validate IDs and mutate only local data. Run `npm test` and `npm run typecheck`.

### Task 3: Render board-only due reminders and scheduling controls

**Files:** `src/board.html`, `src/board.ts`, `src/board.css`, `tests/shared.test.js`

- [ ] Add a failing contract test for `#deferred-reminders`, a tab-row defer action, and board messages; run `npm test` to red.
- [ ] Add a compact due-reminder section above the grid. Add a `稍后处理` tab-row action that opens a datetime picker, requires a future time, and refreshes the board after saving. Due reminder rows offer 打开、改期、删除; none auto-open. Render all data with DOM APIs and textContent. Run `npm test` to green.

### Task 4: Verify

**Files:** all above

- [ ] Run `npm test && npm run typecheck && git diff --check`.
- [ ] In Chrome, defer a page, verify it closes only after saving, choose a past-due time through test data or wait until due, verify it appears only in the board, then open/reschedule/delete it. Confirm no reminder opens automatically and no snapshot is synced.

No commit is included because the user has not requested a commit.
