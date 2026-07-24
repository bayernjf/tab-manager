# Workspace Tab Select-All Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a synchronized `全选` checkbox beside the workspace-name input.

**Architecture:** Add one labeled checkbox to the main workspace dialog. Keep selection state in the existing DOM: a small synchronization function derives checked, unchecked, indeterminate, and disabled state from the rendered tab checkboxes; event listeners apply select-all changes and react to individual changes.

**Tech Stack:** Native TypeScript, HTML, CSS, Chrome Manifest V3, Node.js built-in test runner.

**Repository constraint:** Leave changes uncommitted and preserve unrelated work.

---

### Task 1: Add synchronized workspace tab selection

**Files:**
- Modify: `tests/shared.test.js`
- Modify: `src/board.html:42-46`
- Modify: `src/board.ts:47,86,614`
- Modify: `src/board.css:92-101`

- [ ] **Step 1: Write a failing built-artifact contract**

Extend the workspace-dialog test to require `#workspace-select-all`, its `全选` label, a control-row wrapper, default synchronization after rendering, a `change` handler that assigns the master state to every tab checkbox, delegated individual-checkbox synchronization, empty-list disabling, and responsive wrapping.

```js
assert.match(html, /class="workspace-controls"/);
assert.match(html, /<label class="workspace-select-all"><input id="workspace-select-all" type="checkbox" checked>全选<\/label>/);
assert.match(script, /function syncWorkspaceSelectAll\(\)/);
assert.match(script, /workspaceSelectAll\.indeterminate/);
assert.match(script, /workspaceSelectAll\.disabled/);
assert.match(script, /workspaceSelectAll\.addEventListener\("change"/);
assert.match(script, /workspaceTabs\.addEventListener\("change"/);
assert.match(css, /\.workspace-controls/);
assert.match(css, /\.workspace-select-all/);
```

- [ ] **Step 2: Run the contract and verify red**

Run `npm test`. Expected: the workspace-dialog test fails because `#workspace-select-all` is absent while all earlier tests pass.

- [ ] **Step 3: Add the markup and layout**

Use this structure in `src/board.html`:

```html
<div class="workspace-controls">
  <div class="workspace-name-field">...</div>
  <label class="workspace-select-all"><input id="workspace-select-all" type="checkbox" checked>全选</label>
</div>
```

Style `.workspace-controls` as a wrapping flex row and `.workspace-select-all` as a compact inline-flex label. At narrow container width, let the label move below the name field without overlap.

```css
.workspace-controls { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.workspace-select-all { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer; }
```

- [ ] **Step 4: Add synchronized behavior**

Query `workspaceSelectAll` as `HTMLInputElement`. After `renderWorkspaceTabs()` replaces the list, call `syncWorkspaceSelectAll()`; this function reads every tab checkbox and sets `disabled`, `checked`, and `indeterminate`. On the master checkbox `change`, assign its checked state to every tab checkbox and synchronize. On `workspaceTabs` change, synchronize when the event target is a checkbox.

```ts
function workspaceTabInputs(): HTMLInputElement[] {
  return Array.from(workspaceTabs.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
}

function syncWorkspaceSelectAll(): void {
  const inputs = workspaceTabInputs();
  const checkedCount = inputs.filter((input) => input.checked).length;
  workspaceSelectAll.disabled = inputs.length === 0;
  workspaceSelectAll.checked = inputs.length > 0 && checkedCount === inputs.length;
  workspaceSelectAll.indeterminate = checkedCount > 0 && checkedCount < inputs.length;
}

workspaceSelectAll.addEventListener("change", () => {
  for (const input of workspaceTabInputs()) input.checked = workspaceSelectAll.checked;
  syncWorkspaceSelectAll();
});
workspaceTabs.addEventListener("change", (event) => {
  if (event.target instanceof HTMLInputElement && event.target.type === "checkbox") syncWorkspaceSelectAll();
});
```

- [ ] **Step 5: Verify green and inspect scope**

Run `npm test`, `npm run typecheck`, and `git diff --check`. Inspect `git diff -- src/board.html src/board.css src/board.ts tests/shared.test.js`; no storage, background, restore, permission, dependency, or sync changes are allowed.
