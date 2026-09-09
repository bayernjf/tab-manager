# New Tab Board Implementation Plan

> **Status:** ✅ 已实现（v0.1.11）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a synchronized user preference that opens Tab Garden's board for browser-created new tabs only when enabled.

**Architecture:** Keep the manifest free of a fixed new-tab override. Extend the existing `Settings` data path through local storage, validation, Supabase synchronization, and the Options UI. The background worker observes newly created tabs and conditionally replaces only a native browser new-tab URL with `board.html`.

**Tech Stack:** TypeScript strict mode, Chrome Manifest V3 APIs, Supabase PostgREST, native HTML/CSS, Node.js test runner.

---

### Task 1: Extend the durable settings contract

**Files:**
- Modify: `src/shared.ts`
- Modify: `src/sync.ts`
- Create: `supabase/migrations/007_add_new_tab_board_setting.sql`
- Test: `tests/shared.test.js`

- [ ] **Step 1: Write failing settings-contract tests**

Add tests proving `settingsFromSyncRow()` maps `open_board_on_new_tab: true`, and `validateOptionsSettings()` accepts a complete settings object with `openBoardOnNewTab: true` while rejecting a non-boolean value.

- [ ] **Step 2: Run the test suite to verify the new tests fail**

Run: `npm test`

Expected: the new settings tests fail because the settings field is absent.

- [ ] **Step 3: Add the setting to every settings DTO**

Add `openBoardOnNewTab: boolean` with default `false` to local settings, portable data validation, sync-row conversion, `pushSettings()`, and all settings POST payloads. Existing incomplete data must resolve to the default.

- [ ] **Step 4: Add the additive database migration**

Create migration `007_add_new_tab_board_setting.sql` containing:

```sql
alter table public.user_settings
  add column if not exists open_board_on_new_tab boolean not null default false;
```

- [ ] **Step 5: Run tests and type checks**

Run: `npm test && npm run typecheck`

Expected: all tests pass and TypeScript emits no errors.

### Task 2: Redirect enabled native new tabs to the board

**Files:**
- Modify: `src/shared.ts`
- Modify: `src/background.ts`
- Test: `tests/shared.test.js`

- [ ] **Step 1: Write failing URL-recognition tests**

Add pure-function tests that accept `chrome://newtab/` and reject extension, HTTP(S), and undefined URLs.

- [ ] **Step 2: Run the test suite to verify the new tests fail**

Run: `npm test`

Expected: the new URL-recognition test fails because the helper is absent.

- [ ] **Step 3: Implement the small pure helper and event listener**

Export a helper that recognizes only the native new-tab URL. In `chrome.tabs.onCreated`, load settings, return unless the new preference is enabled and `tab.url` or `tab.pendingUrl` matches, then call `chrome.tabs.update(tab.id, { url: chrome.runtime.getURL("board.html") })`.

- [ ] **Step 4: Run tests and type checks**

Run: `npm test && npm run typecheck`

Expected: all tests pass and TypeScript emits no errors.

### Task 3: Add the Options setting UI

**Files:**
- Modify: `src/options.html`
- Modify: `src/options.ts`
- Test: `tests/shared.test.js`

- [ ] **Step 1: Write a failing built-page assertion**

Add an assertion that `dist/options.html` includes the new-tab checkbox and its explanatory text.

- [ ] **Step 2: Run the test suite to verify the assertion fails**

Run: `npm test`

Expected: the built-page assertion fails because the control is absent.

- [ ] **Step 3: Render and save the setting through the existing form**

Add a "新标签页" section to the existing advanced settings form. Bind it in `render()` and include it in `settingsPayload()` so the existing `save-options-settings` message persists and synchronizes it.

- [ ] **Step 4: Perform final automated verification**

Run: `npm test && npm run typecheck && git diff --check`

Expected: all tests pass, strict TypeScript passes, and there are no whitespace errors.

- [ ] **Step 5: Manually test the extension**

Build with `npm run build`, reload `dist/` in Chrome/Edge, and verify the setting is off by default; verify `+` and Ctrl/Cmd+T open the board only when enabled; verify a regular link's new tab and the popup's board command are not redirected; and verify disabled mode leaves the native new-tab page unchanged.
