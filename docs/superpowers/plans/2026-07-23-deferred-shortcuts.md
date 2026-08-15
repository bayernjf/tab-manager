# Deferred Reminder Shortcuts Implementation Plan

> **Status:** ✅ 已实现（v0.1.11）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure up to five reminder shortcuts and use them from a board tab’s defer menu.

**Architecture:** Add `deferredShortcutMinutes` to stable settings with pure normalization/defaulting in `shared.ts`; preserve it through existing storage and sync mappings. Options edits the list; board consumes it from board state to render the anchored menu and invokes existing `defer-board-tab`.

---

### Task 1: Settings model and tests

- [ ] Add failing tests for `[1,3,5]` defaults, positive unique minute validation, and five-item cap; run `npm test`.
- [ ] Add `deferredShortcutMinutes` to `Settings`, defaults, settings conversion, portable mapping, and settings validation; run `npm test && npm run typecheck`.

### Task 2: Options editor

- [ ] Add a failing built-options test for `#deferred-shortcuts` and its update mapping; run `npm test`.
- [ ] Render editable minute inputs, add/remove controls, and a five-item cap in `options.html`/`options.ts`; persist through `save-options-settings`; run `npm test`.

### Task 3: Board shortcut menu

- [ ] Add a failing built-board test for `.defer-menu`, `deferredShortcutMinutes`, and `defer-board-tab`; run `npm test`.
- [ ] Add a menu opened by `◷`, shortcut buttons, custom datetime entry, close behavior, and safe calls to the existing defer handler; run `npm test && npm run typecheck && git diff --check`.

No commit is included because the user has not requested a commit.
