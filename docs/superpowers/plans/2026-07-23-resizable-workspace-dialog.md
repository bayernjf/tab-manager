# Resizable Workspace Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the main local-workspace dialog natively resizable in width and height without changing the restore dialog or persisting dimensions.

**Architecture:** Add a dedicated class only to `#workspace-dialog`, then use bounded CSS `resize: both`, a named `inline-size` container, and a flex-column open state so the tab checklist grows with available height. After `showModal()`, replace the browser's continuously recalculated automatic centering with a fixed top-left anchor so the lower-right resize handle tracks the pointer. The workspace list retains natural height while the dialog owns overflow. Reset the anchor and resizable layout below 640px.

**Tech Stack:** Native HTML and CSS, Chrome Manifest V3, Node.js built-in test runner.

**Repository constraint:** Leave all changes uncommitted. Preserve unrelated user changes and do not add TypeScript, storage, permissions, or dependencies.

---

### Task 1: Add a failing resizable-dialog contract

**Files:**
- Modify: `tests/shared.test.js:428-501`
- Test: `tests/shared.test.js`

- [ ] **Step 1: Write the failing built-artifact test**

Add this test after `renders local workspace selection and restore-preview dialogs`:

```js
test("makes only the workspace manager dialog resizable", async () => {
  const [html, css] = await Promise.all([
    readFile(new URL("../dist/board.html", import.meta.url), "utf8"),
    readFile(new URL("../dist/board.css", import.meta.url), "utf8"),
  ]);

  const managerDialog = html.match(/<dialog[^>]*id="workspace-dialog"[^>]*>/)?.[0] ?? "";
  const restoreDialog = html.match(/<dialog[^>]*id="workspace-restore-dialog"[^>]*>/)?.[0] ?? "";
  assert.match(managerDialog, /class="[^"]*\bworkspace-dialog-resizable\b[^"]*"/);
  assert.doesNotMatch(restoreDialog, /workspace-dialog-resizable/);

  const resizableRule = css.match(/\.workspace-dialog-resizable \{[^}]*\}/)?.[0] ?? "";
  assert.match(resizableRule, /resize: both;/);
  assert.match(resizableRule, /overflow: auto;/);
  assert.match(resizableRule, /min-width:[^;}]+;/);
  assert.match(resizableRule, /min-height:[^;}]+;/);
  assert.match(resizableRule, /max-width:[^;}]+;/);
  assert.match(resizableRule, /max-height:[^;}]+;/);
  assert.match(resizableRule, /container: workspace-dialog \/ inline-size;/);
  assert.match(css, /\.workspace-dialog-resizable\[open\] \{[^}]*display: flex;[^}]*flex-direction: column;/);
  const workspaceTabsRule = css.match(/\.workspace-dialog-resizable \.workspace-tabs \{[^}]*\}/)?.[0] ?? "";
  assert.match(workspaceTabsRule, /flex:[^;}]+;/);
  assert.match(workspaceTabsRule, /max-height: none;/);
  const workspaceListRule = css.match(/\.workspace-dialog-resizable \.workspace-list \{[^}]*\}/)?.[0] ?? "";
  assert.match(workspaceListRule, /max-height: none;/);
  assert.match(workspaceListRule, /flex: 0 0 auto;/);
  assert.match(workspaceListRule, /overflow: visible;/);

  const narrowToastRule = css.match(/@container workspace-dialog \(max-width: 520px\) \{[^}]*\.workspace-dialog-resizable \.workspace-name-toast \{[^}]*\}/)?.[0] ?? "";
  assert.match(narrowToastRule, /position: static;/);
  assert.match(narrowToastRule, /width: 100%;/);
  assert.match(narrowToastRule, /max-width: none;/);
  assert.match(narrowToastRule, /margin-top: 8px;/);
  assert.match(css, /@container workspace-dialog \(max-width: 520px\)[\s\S]*\.workspace-dialog-resizable \.workspace-name-toast::before \{[^}]*display: none;/);

  const mobileCss = css.slice(css.indexOf("@media (max-width: 640px)"));
  assert.match(mobileCss, /\.workspace-dialog-resizable \{[^}]*height: auto;[^}]*resize: none;/);
  assert.match(mobileCss, /\.workspace-dialog-resizable\[open\] \{[^}]*display: block;/);
  assert.match(mobileCss, /\.workspace-dialog-resizable \.workspace-tabs \{[^}]*max-height: 300px;/);
  assert.match(mobileCss, /\.workspace-dialog-resizable \.workspace-name-toast \{[^}]*margin-top: 6px;/);
  assert.match(mobileCss, /\.workspace-dialog-resizable \.workspace-list \{[^}]*max-height: none;[^}]*flex: 0 0 auto;[^}]*overflow: visible;/);
});
```

- [ ] **Step 2: Run the suite and verify the test fails for the missing resize contract**

Run:

```bash
npm test
```

Expected: FAIL because `#workspace-dialog` lacks `workspace-dialog-resizable` and the resize rules do not exist. All previously existing tests continue to pass.

---

### Task 2: Implement bounded native resizing

**Files:**
- Modify: `src/board.html:40`
- Modify: `src/board.css:83-100`
- Modify: `src/board.ts:85,587-601`
- Test: `tests/shared.test.js`

- [ ] **Step 1: Scope resizing to the main workspace dialog**

Change only the main manager dialog opening tag in `src/board.html`:

```html
<dialog id="workspace-dialog" class="workspace-dialog workspace-dialog-resizable" aria-labelledby="workspace-title">
```

Keep the restore dialog exactly as:

```html
<dialog id="workspace-restore-dialog" class="workspace-dialog" aria-labelledby="workspace-restore-title">
```

- [ ] **Step 2: Add desktop and tablet resizing rules**

Add after the existing `.workspace-dialog` rules in `src/board.css`:

```css
.workspace-dialog-resizable { width: min(620px, calc(100vw - 32px)); height: min(540px, calc(100vh - 32px)); min-width: min(360px, calc(100vw - 32px)); min-height: min(360px, calc(100vh - 32px)); max-width: calc(100vw - 32px); max-height: calc(100vh - 32px); overflow: auto; resize: both; container: workspace-dialog / inline-size; }
.workspace-dialog-resize-anchored { position: fixed; inset: var(--workspace-dialog-top) auto auto var(--workspace-dialog-left); max-width: calc(100vw - var(--workspace-dialog-left) - 16px); max-height: calc(100vh - var(--workspace-dialog-top) - 16px); margin: 0; }
.workspace-dialog-resizable[open] { display: flex; flex-direction: column; }
.workspace-dialog-resizable > .button { align-self: flex-start; }
.workspace-dialog-resizable .workspace-tabs { width: 100%; min-height: 120px; max-height: none; flex: 1 1 0; overflow: auto; }
.workspace-dialog-resizable .workspace-list { width: 100%; min-height: 0; max-height: none; flex: 0 0 auto; overflow: visible; }
@container workspace-dialog (max-width: 520px) { .workspace-dialog-resizable .workspace-name-toast { position: static; width: 100%; max-width: none; margin-top: 8px; transform: none; }.workspace-dialog-resizable .workspace-name-toast::before { display: none; } }
```

This keeps the existing 620px default width, gives the resizer a definite initial height, preserves intrinsic button widths, lets the tab checklist absorb added height, keeps saved workspace rows at natural height, and switches the toast below its input only when the actual dialog container is narrow. The anchor class removes the modal dialog's automatic margins during a drag.

- [ ] **Step 3: Anchor the dialog after native centering**

After `showModal()`, read the dialog rectangle, clamp its top-left corner and available maximum size to the 16px viewport margin, store the coordinates in `--workspace-dialog-left` and `--workspace-dialog-top`, and apply `workspace-dialog-resize-anchored`. Refresh this anchor from the existing window resize listener. At 640px or below, remove the anchor class and variables.

- [ ] **Step 4: Reset resizing and flex layout at mobile width**

Append these rules inside the existing `@media (max-width: 640px)` block:

```css
.workspace-dialog-resize-anchored { inset: 0; margin: auto; }
.workspace-dialog-resizable { width: calc(100vw - 32px); height: auto; min-width: 0; min-height: 0; max-width: calc(100vw - 32px); max-height: calc(100vh - 32px); overflow: auto; resize: none; }
.workspace-dialog-resizable[open] { display: block; }
.workspace-dialog-resizable .workspace-tabs { width: auto; min-height: 0; max-height: 300px; overflow: auto; }
.workspace-dialog-resizable .workspace-name-toast { margin-top: 6px; }
.workspace-dialog-resizable .workspace-list { width: auto; max-height: none; flex: 0 0 auto; overflow: visible; }
```

- [ ] **Step 5: Build and verify the contract turns green**

Run:

```bash
npm test
npm run typecheck
git diff --check
```

Expected: all tests pass, TypeScript validation remains clean, and no whitespace errors are reported.

- [ ] **Step 6: Inspect the focused diff**

Run:

```bash
git diff -- src/board.html src/board.css src/board.ts tests/shared.test.js
```

Expected: only the main dialog class, scoped resize/layout and anchor rules, the dialog anchor lifecycle in `board.ts`, responsive reset, and contract test are added. There are no changes to storage, background messages, permissions, or the restore dialog class.

---

### Task 3: Verify interaction and boundaries

**Files:**
- Verify: `src/board.html`
- Verify: `src/board.css`
- Verify: `src/board.ts`
- Verify: `tests/shared.test.js`

- [ ] **Step 1: Run complete automated verification**

Run:

```bash
npm test
npm run typecheck
git diff --check
```

Expected: exit code 0 for every command and no failing tests.

- [ ] **Step 2: Verify the rebuilt extension in Chrome or Edge**

Reload the unpacked `dist/` extension, open the board, and open the local-workspace dialog. Confirm:

1. Above 640px, dragging the lower-right corner changes both width and height, and the handle remains directly under the pointer.
2. The dialog cannot shrink below a usable size or grow outside the viewport margin.
3. Increasing height reveals more rows in the tab checklist.
4. Decreasing height leaves save, saved-workspace, and close controls reachable through dialog scrolling; the saved-workspace list itself has no independent scrollbar.
5. Close and reopen during the same page session retains the resized element dimensions.
6. The restore-workspace dialog has no resize handle.
7. At 640px and below, the manager dialog fits the viewport and has no resize handle.
8. At the default 620px width, the workspace-name validation Toast remains to the right of the input; at a resized width of 520px or less, it is visible below the input with no arrow or transform.
9. At 640px and below, the mobile Toast keeps its existing 6px top margin.

- [ ] **Step 3: Leave the worktree uncommitted**

Do not stage, commit, push, create a PR, merge, or delete any files. Report the changed files and verification evidence.
